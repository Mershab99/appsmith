import React from "react";
import IntegrationsHomeScreen from "./IntegrationsHomeScreen";
import { RouteComponentProps } from "react-router";
import * as Sentry from "@sentry/react";

type Props = RouteComponentProps<{
  applicationId: string;
  pageId: string;
  selectedTab: string;
}>;

const integrationsEditor = (props: Props) => {
  const { history, location, match } = props;
  console.log("integrations editor");
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
      }}
    >
      <IntegrationsHomeScreen
        applicationId={match.params.applicationId}
        history={history}
        location={location}
        pageId={match.params.pageId}
        selectedTab={match.params.selectedTab}
      />
    </div>
  );
};

export default Sentry.withProfiler(integrationsEditor);
