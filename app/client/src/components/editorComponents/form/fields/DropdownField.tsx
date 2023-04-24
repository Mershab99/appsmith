import React from "react";
import _ from "lodash";
import type { DropdownProps } from "components/designSystems/appsmith/Dropdown";
import { Field } from "redux-form";
import { replayHighlightClass } from "globalStyles/portals";
import type { SelectOptionProps } from "design-system";
import { Select, Option } from "design-system";
import { getAssetUrl } from "../../../../ce/utils/airgapHelpers";

const Container = styled.div`
  display: flex;
  gap: 8px;
`;
const renderDropdown = (props: any) => {
  return (
    <Select>
      {props.options.map((option: SelectOptionProps) => (
        <Option key={option.value} value={option.value}>
          <Container>
            {option.image && (
              <img
                alt="Datasource"
                className="plugin-image"
                src={getAssetUrl(option.image)}
              />
            )}
            {option.label}
          </Container>
        </Option>
      ))}
    </Select>
  );
};

function DropdownField(props: SelectOptionProps & Partial<DropdownProps>) {
  return (
    <Field
      className={`${props.className} ${replayHighlightClass}`}
      component={renderDropdown}
      format={(value: string) => _.find(props.options, { value }) || ""}
      normalize={(option: { value: string }) => option.value}
      {...props}
      isDisabled={props.isDisabled}
      isSearchable={props.isSearchable}
      placeholder={props.placeholder}
    />
  );
}

export default DropdownField;
