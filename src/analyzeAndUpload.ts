/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InvocationContext } from "@azure/functions";
import { compile, compileFromFile } from "@typespec/compiler";
import { IApiCenterClient } from "./client/IApiCenterClient";
import { ApiDefinitionResource } from "./utils/armResourceIdUtils";

export interface runAnalysisOptions {
    apiDefinitionResource: ApiDefinitionResource;
    rulesetFilePath: string;
    apiCenterClient: IApiCenterClient;
}

/**
 * Analyzes the API specification and uploads the results to the API Center service.
 */
export async function analyzeAndUploadAsync(options: runAnalysisOptions, context: InvocationContext): Promise<void> {
    let operationId = "";
    let apiCenterClient = options.apiCenterClient;

    try {
        context.log('Starting API Analysis process.');
        const response = await apiCenterClient.updateAnalysisStateAsync({
            state: "started"
        });
        operationId = response.operationId;

        context.log(`Operation ID: ${operationId || "empty"}`);
        context.log('Fetching spec file.');
        const specFileContent = await apiCenterClient.getApiSpecificationFileContentAsync();

        context.log('Compiling spec file using TypeSpec.');
        const diagnostics = await compileFromFile(specFileContent);

        context.log('Transforming results');
        const uniformAnalysisResults = diagnostics.map(diagnostic => ({
            analyzer: "typespec",
            description: diagnostic.message,
            analyzerRuleName: diagnostic.code,
            severity: diagnostic.severity,
            docUrl: null,
            details: {
                range: {
                    start: `${diagnostic.range.start.line}:${diagnostic.range.start.character}`,
                    end: `${diagnostic.range.end.line}:${diagnostic.range.end.character}`
                }
            }
        }));

        context.log('Uploading report');
        await apiCenterClient.updateAnalysisStateAsync(
            {
                state: "completed",
                validationResults: { results: uniformAnalysisResults },
                operationId: operationId
            }
        );

        context.log('API Analysis complete');
    } catch (error) {
        context.error(`Error occurred during API Analysis: ${error}`);
        await apiCenterClient.updateAnalysisStateAsync(
            {
                state: "failed",
                operationId: operationId
            }
        );
        throw error;
    }
}
