import type { ReactNode } from "react";
import React, { useState } from "react";

import { useDispatch, useSelector } from "react-redux";
import {
  getForkableWorkspaces,
  isImportingTemplateSelector,
} from "selectors/templatesSelectors";
import { importTemplateToWorkspace } from "actions/templateActions";
import {
  CANCEL,
  CHOOSE_WHERE_TO_FORK,
  createMessage,
  FORK_TEMPLATE,
  SELECT_WORKSPACE,
} from "@appsmith/constants/messages";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
} from "design-system";

interface ForkTemplateProps {
  children?: ReactNode;
  showForkModal: boolean;
  onClose: (e?: React.MouseEvent<HTMLElement>) => void;
  templateId: string;
}

function ForkTemplate({
  children,
  onClose,
  showForkModal,
  templateId,
}: ForkTemplateProps) {
  const workspaceList = useSelector(getForkableWorkspaces);
  const [selectedWorkspace, setSelectedWorkspace] = useState(workspaceList[0]);
  const isImportingTemplate = useSelector(isImportingTemplateSelector);
  const dispatch = useDispatch();
  const onFork = () => {
    dispatch(importTemplateToWorkspace(templateId, selectedWorkspace.value));
  };

  const closeModal = (isOpen: boolean) => {
    if (!isOpen && !isImportingTemplate) {
      onClose();
    }
  };

  return (
    <>
      {children}
      <Modal onOpenChange={closeModal} open={showForkModal}>
        <ModalContent>
          <ModalHeader>
            {/* <Icon name="fork-2" size="lg" /> */}
            {createMessage(CHOOSE_WHERE_TO_FORK)}
          </ModalHeader>
          <ModalBody>
            <Select
              dropdownMatchSelectWidth
              onSelect={(
                dropdownOption: React.SetStateAction<{
                  value: string;
                  label: string;
                }>,
              ) => setSelectedWorkspace(dropdownOption)}
              options={workspaceList}
              placeholder={createMessage(SELECT_WORKSPACE)}
              value={selectedWorkspace}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              isDisabled={isImportingTemplate}
              kind="secondary"
              onClick={onClose}
              size="md"
            >
              {createMessage(CANCEL)}
            </Button>
            <Button
              className="t--fork-template-button"
              isLoading={isImportingTemplate}
              onClick={onFork}
              size="md"
            >
              {createMessage(FORK_TEMPLATE)}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default ForkTemplate;
