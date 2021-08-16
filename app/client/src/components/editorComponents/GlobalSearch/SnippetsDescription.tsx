import React, { useCallback, useState } from "react";
import { useDispatch } from "react-redux";
import styled from "styled-components";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import sql from "react-syntax-highlighter/dist/cjs/languages/prism/sql";
import { prism } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { TabbedViewContainer } from "pages/Editor/APIEditor/Form";
import { TabComponent } from "components/ads/Tabs";
import {
  EditorModes,
  EditorSize,
  EditorTheme,
  TabBehaviour,
} from "../CodeEditor/EditorConfig";
import CodeEditor from "../CodeEditor";
import Button, { Size } from "components/ads/Button";
import {
  evaluateArgument,
  evaluateSnippet,
  setEvaluatedSnippet,
  setGlobalSearchFilterContext,
  unsetEvaluatedArgument,
} from "actions/globalSearchActions";
import { useSelector } from "store";
import { AppState } from "reducers";
import ReadOnlyEditor from "../ReadOnlyEditor";
import copy from "copy-to-clipboard";
import { js_beautify } from "js-beautify";
import { useEffect } from "react";
import { validate } from "workers/validations";
import {
  ValidationResponse,
  ValidationTypes,
} from "constants/WidgetValidation";
import { debounce } from "lodash";
import { bindingHint } from "../CodeEditor/hintHelpers";
import { Snippet, SnippetArgument, SnippetExample } from "./utils";
import { createMessage, SEARCH_ITEM_SELECT } from "constants/messages";
import { getExpectedValue } from "utils/validation/common";

SyntaxHighlighter.registerLanguage("sql", sql);

const SnippetContainer = styled.div`
  display: flex;
  flex-direction: column;
  .snippet-title {
    color: #090707;
    font-size: 17px;
    font-weight: 500;
    display: flex;
    justify-content: space-between;
    .action-msg {
      color: #a9a7a7;
      font-size: 11px;
      font-weight: 400;
      flex-shrink: 0;
    }
  }
  .snippet-desc {
    color: #4b4848;
    font-size: 14px;
    font-weight: 400;
    margin: 10px 0;
  }
  .snippet-group {
    margin: 5px 0;
    .header {
      font-weight: 500;
      font-size: 14px;
    }
    .content {
      font-weight: 400;
      font-size: 14px;
    }
    .argument {
      display: flex;
      justify-content: space-between;
      flex-direction: column;
      margin: 5px 0;
      .args-dropdown {
        box-shadow: none;
        background-color: ${(props) => props.theme.colors.propertyPane.bg};
        border: none;
      }
    }
    .danger {
      color: red;
      font-size: 12px;
    }
  }
  .tab-container {
    border-top: none;
    .react-tabs__tab-panel {
      background: white !important;
      height: auto !important;
      overflow: clip;
      margin-top: 2px;
      border-top: 1px solid #f0f0f0;
      code {
        .token.arrow {
          background: transparent !important;
        }
      }
      .actions-container {
        display: flex;
        margin: 15px 0;
        button {
          margin-right: 5px;
        }
        .copy-snippet-btn {
          border: 2px solid #a9a7a7;
          color: #a9a7a7;
          background: white;
          transition: 0.5s;
        }
      }
    }
    .react-tabs__tab-list {
      background: white !important;
      padding: 0 10px !important;
      color: #a9a7a7 !important;
      .react-tabs__tab--selected {
        color: #f86a2b;
      }
    }
  }
`;

const removeDynamicBinding = (value: string) => {
  const regex = /{{(.*?)}}/g;
  return value.replace(regex, function(match, capture) {
    return capture;
  });
};

export const getSnippet = (snippet: string, args: any) => {
  const regex = /{{(.*?)}}/g;
  return snippet.replace(regex, function(match, capture) {
    const substitution = (args[capture] || "")
      .replace("{{", "")
      .replace("}}", "");
    return substitution || capture;
  });
};

const getArgValidationType = (type: string) => {
  if (type === "STRING") {
    return ValidationTypes.TEXT;
  }
  return type as ValidationTypes;
};

export default function SnippetDescription({ item }: { item: Snippet }) {
  const {
    body: {
      additionalInfo,
      args,
      examples,
      isTrigger,
      snippet,
      summary,
      title,
    },
    dataType,
    language,
  } = item;
  const [selectedIndex, setSelectedIndex] = useState(0),
    [selectedArgs, setSelectedArgs] = useState<any>({}),
    dispatch = useDispatch(),
    evaluatedSnippet = useSelector(
      (state: AppState) => state.ui.globalSearch.filterContext.evaluatedSnippet,
    ),
    [isCopied, setIsCopied] = useState(false),
    executionInProgress = useSelector(
      (state: AppState) =>
        state.ui.globalSearch.filterContext.executionInProgress,
    ),
    [validations, setValidations] = useState<
      Record<string, ValidationResponse>
    >(),
    evaluatedArguments = useSelector(
      (state: AppState) =>
        state.ui.globalSearch.filterContext.evaluatedArguments,
    );

  const handleArgsValidation = useCallback(
    debounce((value, arg) => {
      const { name, type } = arg;
      dispatch(
        evaluateArgument({
          name,
          value: removeDynamicBinding(value),
          type,
        }),
      );
    }, 500),
    [validations],
  );

  const handleCopy = useCallback(() => {
    copy(`{{ ${getSnippet(snippet, selectedArgs)} }}`);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  }, [snippet, selectedArgs]);

  const handleRun = useCallback(() => {
    dispatch(
      setGlobalSearchFilterContext({
        executionInProgress: true,
      }),
    );
    dispatch(
      evaluateSnippet({
        expression: getSnippet(snippet, selectedArgs),
        dataType: dataType,
        isTrigger,
      }),
    );
  }, [snippet, selectedArgs, dataType]);

  const handleArgChange = useCallback(
    (value, arg) => {
      setSelectedArgs({
        ...selectedArgs,
        [arg.name]: value,
      });
      if (arg.type && Object.values(ValidationTypes).includes(arg.type))
        handleArgsValidation(value, arg);
    },
    [selectedArgs],
  );

  useEffect(() => {
    const validations: any = Object.values(evaluatedArguments);
    setValidations(
      validations.reduce(
        (acc: any, arg: SnippetArgument & { value: string }) => {
          acc[arg.name] = validate(
            { type: getArgValidationType(arg.type) },
            arg.value,
            {},
          );
          return acc;
        },
        {},
      ),
    );
  }, [evaluatedArguments]);

  useEffect(() => {
    document
      .querySelector("#snippet-evaluator")
      ?.scrollIntoView({ behavior: "smooth" });
  }, [evaluatedSnippet]);

  useEffect(() => {
    setSelectedIndex(0);
    setEvaluatedSnippet("");
    setSelectedArgs({});
    unsetEvaluatedArgument();
  }, [title]);

  const tabs = [
    {
      key: "Snippet",
      title: "Snippet",
      panelComponent: (
        <>
          <SyntaxHighlighter language={language} style={prism} wrapLongLines>
            {js_beautify(getSnippet(snippet, {}), { indent_size: 2 })}
          </SyntaxHighlighter>
          {examples && examples.length ? (
            <div className="snippet-group">
              <div className="header">Example</div>
              <div className="content">
                {examples.map((ex: SnippetExample) => (
                  <>
                    <p>{ex.title}</p>
                    <SyntaxHighlighter
                      language={language}
                      style={prism}
                      wrapLongLines
                    >
                      {js_beautify(ex.code, { indent_size: 2 })}
                    </SyntaxHighlighter>
                    <p>{ex.summary}</p>
                  </>
                ))}
              </div>
            </div>
          ) : (
            <div />
          )}
        </>
      ),
    },
  ];
  if (args && args.length > 0 && language === "javascript") {
    tabs.push({
      key: "Customize",
      title: "Customize",
      panelComponent:
        args && args.length > 0 ? (
          <>
            <SyntaxHighlighter language={language} style={prism} wrapLongLines>
              {js_beautify(getSnippet(snippet, selectedArgs), {
                indent_size: 2,
              })}
            </SyntaxHighlighter>
            <div className="snippet-group">
              {args.map((arg: SnippetArgument) => (
                <div
                  className="argument"
                  key={arg.name}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <span>{arg.name}</span>
                  <CodeEditor
                    expected={getExpectedValue({ type: arg.type })}
                    hideEvaluatedValue
                    hinting={[bindingHint]}
                    input={{
                      value: selectedArgs[arg.name],
                      onChange: (value: any) => handleArgChange(value, arg),
                    }}
                    mode={EditorModes.TEXT_WITH_BINDING}
                    showLightningMenu={false}
                    size={EditorSize.EXTENDED}
                    tabBehaviour={TabBehaviour.INDENT}
                    theme={EditorTheme.LIGHT}
                  />
                  {validations && (
                    <span className="danger">
                      {validations[arg.name]?.message}
                    </span>
                  )}
                </div>
              ))}
              <div className="actions-container">
                <Button
                  className="t--apiFormRunBtn"
                  disabled={executionInProgress}
                  onClick={handleRun}
                  size={Size.medium}
                  tag="button"
                  text="Run"
                  type="button"
                />
                <Button
                  className="copy-snippet-btn"
                  onClick={handleCopy}
                  size={Size.medium}
                  tag="button"
                  text={isCopied ? "Copied" : "Copy Snippet"}
                  type="button"
                />
              </div>
              <div id="snippet-evaluator">
                {evaluatedSnippet && (
                  <div className="snippet-group">
                    <div className="header">Evaluated Snippet</div>
                    <div className="content">
                      <ReadOnlyEditor
                        folding
                        height="300px"
                        input={{ value: evaluatedSnippet }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div />
        ),
    });
  }
  return (
    <SnippetContainer>
      <div className="snippet-title">
        <span>{title}</span>
        <span className="action-msg">{createMessage(SEARCH_ITEM_SELECT)}</span>
      </div>
      <div className="snippet-desc">{summary}</div>
      <TabbedViewContainer className="tab-container">
        <TabComponent
          onSelect={setSelectedIndex}
          selectedIndex={selectedIndex}
          tabs={tabs}
        />
      </TabbedViewContainer>
      {additionalInfo &&
        additionalInfo.map(({ content, header }) => (
          <div className="snippet-group" key={header}>
            <div className="header">{header}</div>
            <div className="content">{content}</div>
          </div>
        ))}
    </SnippetContainer>
  );
}
