import { ReduxActionTypes } from "ce/constants/ReduxActionConstants";
import { TJSLibrary } from "utils/DynamicBindingUtils";

export function fetchJSLibraries(applicationId: string) {
  return {
    type: ReduxActionTypes.FETCH_JS_LIBRARIES_INIT,
    payload: applicationId,
  };
}

export function installLibraryInit(payload: Partial<TJSLibrary>) {
  return {
    type: ReduxActionTypes.INSTALL_LIBRARY_INIT,
    payload,
  };
}

export function uninstallLibraryInit(payload: string) {
  return {
    type: ReduxActionTypes.UNINSTALL_LIBRARY_INIT,
    payload,
  };
}
