package com.appsmith.server.solutions;

import com.appsmith.server.repositories.PermissionGroupRepository;
import com.appsmith.server.services.ApplicationService;
import com.appsmith.server.services.CustomJSLibService;
import com.appsmith.server.solutions.ce.PartialImportExportServiceCEImpl;
import com.google.gson.Gson;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@Primary
public class PartialImportExportServiceImpl extends PartialImportExportServiceCEImpl
        implements PartialImportExportService {

    public PartialImportExportServiceImpl(
            ImportExportApplicationService importExportApplicationService,
            Gson gson,
            ApplicationService applicationService,
            CustomJSLibService customJSLibService,
            PermissionGroupRepository permissionGroupRepository,
            WorkspacePermission workspacePermission,
            ApplicationPermission applicationPermission,
            PagePermission pagePermission,
            ActionPermission actionPermission,
            DatasourcePermission datasourcePermission) {
        super(
                importExportApplicationService,
                gson,
                applicationService,
                customJSLibService,
                permissionGroupRepository,
                workspacePermission,
                applicationPermission,
                pagePermission,
                actionPermission,
                datasourcePermission);
    }
}