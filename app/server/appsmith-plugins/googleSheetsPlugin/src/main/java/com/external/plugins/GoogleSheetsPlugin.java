package com.external.plugins;

import com.appsmith.external.dtos.ExecuteActionDTO;
import com.appsmith.external.exceptions.pluginExceptions.AppsmithPluginError;
import com.appsmith.external.exceptions.pluginExceptions.AppsmithPluginException;
import com.appsmith.external.helpers.DataTypeStringUtils;
import com.appsmith.external.helpers.MustacheHelper;
import com.appsmith.external.models.ActionConfiguration;
import com.appsmith.external.models.ActionExecutionResult;
import com.appsmith.external.models.DatasourceConfiguration;
import com.appsmith.external.models.DatasourceTestResult;
import com.appsmith.external.models.OAuth2;
import com.appsmith.external.models.Property;
import com.appsmith.external.models.TriggerRequestDTO;
import com.appsmith.external.models.TriggerResultDTO;
import com.appsmith.external.plugins.BasePlugin;
import com.appsmith.external.plugins.PluginExecutor;
import com.appsmith.external.plugins.SmartSubstitutionInterface;
import com.external.config.ExecutionMethod;
import com.external.config.GoogleSheetsMethodStrategy;
import com.external.config.MethodConfig;
import com.external.config.TriggerMethod;
import com.external.constants.FieldName;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.pf4j.Extension;
import org.pf4j.PluginWrapper;
import org.springframework.http.HttpHeaders;
import org.springframework.util.CollectionUtils;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.appsmith.external.helpers.PluginUtils.OBJECT_TYPE;
import static com.appsmith.external.helpers.PluginUtils.STRING_TYPE;
import static com.appsmith.external.helpers.PluginUtils.getDataValueSafelyFromFormData;
import static com.appsmith.external.helpers.PluginUtils.setDataValueSafelyInFormData;
import static com.appsmith.external.helpers.PluginUtils.validConfigurationPresentInFormData;
import static java.lang.Boolean.TRUE;

public class GoogleSheetsPlugin extends BasePlugin {

    // Setting max content length. This would've been coming from `spring.codec.max-in-memory-size` property if the
    // `WebClient` instance was loaded as an auto-wired bean.
    public static final ExchangeStrategies EXCHANGE_STRATEGIES = ExchangeStrategies
            .builder()
            .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(/* 10MB */ 10 * 1024 * 1024))
            .build();

    public GoogleSheetsPlugin(PluginWrapper wrapper) {
        super(wrapper);
    }

    @Slf4j
    @Extension
    public static class GoogleSheetsPluginExecutor implements PluginExecutor<Void>, SmartSubstitutionInterface {

        private static final int SMART_JSON_SUBSTITUTION_INDEX = 13;

        private static final Set<String> jsonFields = new HashSet<>(Arrays.asList(
                FieldName.ROW_OBJECT,
                FieldName.ROW_OBJECTS
        ));

        @Override
        public Mono<ActionExecutionResult> executeParameterized(Void connection,
                                                                ExecuteActionDTO executeActionDTO,
                                                                DatasourceConfiguration datasourceConfiguration,
                                                                ActionConfiguration actionConfiguration) {

            boolean smartJsonSubstitution;
            final Map<String, Object> formData = actionConfiguration.getFormData();
            List<Map.Entry<String, String>> parameters = new ArrayList<>();

            // Default smart substitution to true
            if (!validConfigurationPresentInFormData(formData, FieldName.SMART_SUBSTITUTION)) {
                smartJsonSubstitution = true;
            } else {
                Object ssubValue = getDataValueSafelyFromFormData(formData, FieldName.SMART_SUBSTITUTION, OBJECT_TYPE, true);
                if (ssubValue instanceof Boolean) {
                    smartJsonSubstitution = (Boolean) ssubValue;
                } else if (ssubValue instanceof String) {
                    smartJsonSubstitution = Boolean.parseBoolean((String) ssubValue);
                } else {
                    smartJsonSubstitution = true;
                }
            }

            try {
                // Smartly substitute in Json fields and replace all the bindings with values.
                if (TRUE.equals(smartJsonSubstitution)) {
                    jsonFields.forEach(jsonField -> {
                        String property = getDataValueSafelyFromFormData(formData, jsonField, STRING_TYPE, null);
                        if (property != null) {

                            // First extract all the bindings in order
                            List<String> mustacheKeysInOrder = MustacheHelper.extractMustacheKeysInOrder(property);
                            // Replace all the bindings with a placeholder
                            String updatedValue = MustacheHelper.replaceMustacheWithPlaceholder(property, mustacheKeysInOrder);

                            updatedValue = (String) smartSubstitutionOfBindings(updatedValue,
                                    mustacheKeysInOrder,
                                    executeActionDTO.getParams(),
                                    parameters);

                            setDataValueSafelyInFormData(formData, jsonField, updatedValue);
                        }
                    });
                }
            } catch (AppsmithPluginException e) {
                // Initializing object for error condition
                ActionExecutionResult errorResult = new ActionExecutionResult();
                errorResult.setStatusCode(AppsmithPluginError.PLUGIN_ERROR.getAppErrorCode().toString());
                errorResult.setIsExecutionSuccess(false);
                errorResult.setErrorInfo(e);
                return Mono.just(errorResult);
            }

            prepareConfigurationsForExecution(executeActionDTO, actionConfiguration, datasourceConfiguration);

            return this.executeCommon(connection, datasourceConfiguration, actionConfiguration);
        }

        public Mono<ActionExecutionResult> executeCommon(Void connection,
                                                         DatasourceConfiguration datasourceConfiguration,
                                                         ActionConfiguration actionConfiguration) {

            // Initializing object for error condition
            ActionExecutionResult errorResult = new ActionExecutionResult();
            errorResult.setStatusCode(AppsmithPluginError.PLUGIN_ERROR.getAppErrorCode().toString());
            errorResult.setIsExecutionSuccess(false);

            // Check if method is defined
            final Map<String, Object> formData = actionConfiguration.getFormData();
            final ExecutionMethod executionMethod = CollectionUtils.isEmpty(formData)
                    ? null
                    : GoogleSheetsMethodStrategy.getExecutionMethod(formData, objectMapper);

            if (executionMethod == null) {
                return Mono.error(new AppsmithPluginException(
                        AppsmithPluginError.PLUGIN_EXECUTE_ARGUMENT_ERROR,
                        "Missing Google Sheets method."
                ));
            }

            // Convert unreadable map to a DTO
            MethodConfig methodConfig = new MethodConfig(formData);

            // Initializing webClient to be used for http call
            WebClient.Builder webClientBuilder = WebClient.builder();

            executionMethod.validateExecutionMethodRequest(methodConfig);

            WebClient client = webClientBuilder
                    .exchangeStrategies(EXCHANGE_STRATEGIES)
                    .build();

            // Authentication will already be valid at this point
            final OAuth2 oauth2 = (OAuth2) datasourceConfiguration.getAuthentication();
            assert (oauth2.getAuthenticationResponse() != null);

            // Triggering the actual REST API call
            return executionMethod.executePrerequisites(methodConfig, oauth2)
                    // This method call will populate the request with all the configurations it needs for a particular method
                    .flatMap(res -> {
                        return executionMethod.getExecutionClient(client, methodConfig)
                                .headers(headers -> headers.set(
                                        "Authorization",
                                        "Bearer " + oauth2.getAuthenticationResponse().getToken()))
                                .exchange()
                                .flatMap(clientResponse -> clientResponse.toEntity(byte[].class))
                                .map(response -> {
                                    // Populate result object
                                    ActionExecutionResult result = new ActionExecutionResult();

                                    // Set response status
                                    result.setStatusCode(response.getStatusCode().toString());
                                    result.setIsExecutionSuccess(response.getStatusCode().is2xxSuccessful());

                                    HttpHeaders headers = response.getHeaders();
                                    // Convert the headers into json tree to store in the results
                                    String headerInJsonString;
                                    try {
                                        headerInJsonString = objectMapper.writeValueAsString(headers);
                                    } catch (JsonProcessingException e) {
                                        throw Exceptions.propagate(
                                                new AppsmithPluginException(AppsmithPluginError.PLUGIN_ERROR, e));
                                    }

                                    // Set headers in the result now
                                    try {
                                        result.setHeaders(objectMapper.readTree(headerInJsonString));
                                    } catch (IOException e) {
                                        throw Exceptions.propagate(
                                                new AppsmithPluginException(
                                                        AppsmithPluginError.PLUGIN_JSON_PARSE_ERROR,
                                                        headerInJsonString,
                                                        e.getMessage()
                                                )
                                        );
                                    }

                                    // Choose body depending on response status
                                    byte[] body = response.getBody();
                                    try {
                                        if (body == null) {
                                            body = new byte[0];
                                        }
                                        String jsonBody = new String(body);
                                        JsonNode jsonNodeBody = objectMapper.readTree(jsonBody);

                                        if (response.getStatusCode().is2xxSuccessful()) {
                                            result.setBody(executionMethod.transformExecutionResponse(jsonNodeBody, methodConfig));
                                        } else {
                                            result.setBody(jsonNodeBody
                                                    .get("error")
                                                    .get("message")
                                                    .asText());
                                        }
                                    } catch (IOException e) {
                                        throw Exceptions.propagate(
                                                new AppsmithPluginException(
                                                        AppsmithPluginError.PLUGIN_JSON_PARSE_ERROR,
                                                        new String(body),
                                                        e.getMessage()
                                                )
                                        );
                                    }

                                    return result;
                                })
                                .onErrorResume(e -> {
                                    errorResult.setBody(Exceptions.unwrap(e).getMessage());
                                    System.out.println(e.getMessage());
                                    return Mono.just(errorResult);
                                });
                    })
                    .switchIfEmpty(handleEmptyMono());
        }

        /**
         * Method to handle empty Mono
         *
         * @return Mono<ActionExecutionResult>
         */
        private Mono<ActionExecutionResult> handleEmptyMono() {
            final ActionExecutionResult result = new ActionExecutionResult();
            result.setIsExecutionSuccess(true);
            result.setBody(objectMapper.valueToTree(Map.of("message", "No operation was performed")));
            return Mono.just(result);
        }

        @Override
        public Mono<ActionExecutionResult> execute(Void connection, DatasourceConfiguration datasourceConfiguration, ActionConfiguration actionConfiguration) {
            // Unused function
            return Mono.error(new AppsmithPluginException(AppsmithPluginError.PLUGIN_ERROR, "Unsupported Operation"));
        }

        @Override
        public Mono<Void> datasourceCreate(DatasourceConfiguration datasourceConfiguration) {
            return Mono.empty();
        }

        @Override
        public void datasourceDestroy(Void connection) {
            // This plugin doesn't have a connection to destroy
        }

        @Override
        public Set<String> validateDatasource(DatasourceConfiguration datasourceConfiguration) {
            return Set.of();
        }

        @Override
        public Mono<DatasourceTestResult> testDatasource(DatasourceConfiguration datasourceConfiguration) {
            // This plugin would not have the option to test
            return Mono.just(new DatasourceTestResult());
        }

        @Override
        public Mono<ActionExecutionResult> getDatasourceMetadata(List<Property> pluginSpecifiedTemplates,
                                                                 DatasourceConfiguration datasourceConfiguration) {
            ActionConfiguration actionConfiguration = new ActionConfiguration();
            actionConfiguration.setPluginSpecifiedTemplates(pluginSpecifiedTemplates);
            return executeCommon(null, datasourceConfiguration, actionConfiguration);
        }

        @Override
        public Object substituteValueInInput(int index,
                                             String binding,
                                             String value,
                                             Object input,
                                             List<Map.Entry<String, String>> insertedParams,
                                             Object... args) {
            String jsonBody = (String) input;
            return DataTypeStringUtils.jsonSmartReplacementPlaceholderWithValue(jsonBody, value, null, insertedParams, null);
        }

        @Override
        public Mono<TriggerResultDTO> trigger(Void connection, DatasourceConfiguration datasourceConfiguration, TriggerRequestDTO request) {
            final TriggerMethod triggerMethod = GoogleSheetsMethodStrategy.getTriggerMethod(request, objectMapper);
            MethodConfig methodConfig = new MethodConfig(request);

            // Initializing webClient to be used for http call
            WebClient.Builder webClientBuilder = WebClient.builder();

            triggerMethod.validateTriggerMethodRequest(methodConfig);

            WebClient client = webClientBuilder
                    .exchangeStrategies(EXCHANGE_STRATEGIES)
                    .build();

            // Authentication will already be valid at this point
            final OAuth2 oauth2 = (OAuth2) datasourceConfiguration.getAuthentication();
            assert (oauth2.getAuthenticationResponse() != null);

            return triggerMethod.getTriggerClient(client, methodConfig)
                    .headers(headers -> headers.set(
                            "Authorization",
                            "Bearer " + oauth2.getAuthenticationResponse().getToken()))
                    .exchange()
                    .flatMap(clientResponse -> clientResponse.toEntity(byte[].class))
                    .map(response -> {
                        // Choose body depending on response status
                        byte[] body = response.getBody();

                        if (body == null) {
                            body = new byte[0];
                        }
                        String jsonBody = new String(body);
                        JsonNode jsonNodeBody = null;
                        try {
                            jsonNodeBody = objectMapper.readTree(jsonBody);
                        } catch (JsonProcessingException e) {
                            throw Exceptions.propagate(
                                    new AppsmithPluginException(
                                            AppsmithPluginError.PLUGIN_JSON_PARSE_ERROR,
                                            jsonBody,
                                            e.getMessage()
                                    ));
                        }

                        if (response.getStatusCode().is2xxSuccessful()) {
                            final JsonNode triggerResponse = triggerMethod.transformTriggerResponse(jsonNodeBody, methodConfig);
                            final TriggerResultDTO triggerResultDTO = new TriggerResultDTO();
                            triggerResultDTO.setTrigger(triggerResponse);
                            return triggerResultDTO;
                        } else {
                            throw Exceptions.propagate(
                                    new AppsmithPluginException(
                                            AppsmithPluginError.PLUGIN_ERROR,
                                            jsonNodeBody
                                                    .get("error")
                                                    .get("message")
                                                    .asText())
                            );
                        }
                    });
        }
    }
}