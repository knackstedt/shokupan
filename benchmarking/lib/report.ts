
import { Eta } from 'eta';
import fs from "fs";
import path from "path";
import { HistoryEntry, SCENARIOS } from "../config";

const REPORT_PATH = path.join(import.meta.dir, "../advanced-report.html");

export function generateReport(history: HistoryEntry[], skipAutoOpen = false) {
    const sortedHistory = [...history].reverse();
    const latest = sortedHistory[0];

    // Extract actual scenarios that were run
    const runScenarios = new Set<string>();
    Object.values(latest.results).forEach(frameworkRes => {
        Object.values(frameworkRes).forEach(runtimeRes => {
            Object.keys(runtimeRes).forEach(scenario => {
                runScenarios.add(scenario);
            });
        });
    });
    const actualScenarios = Array.from(runScenarios);

    // Read template files
    const templatePath = path.join(import.meta.dir, "../report/template.eta");
    const template = fs.readFileSync(templatePath, 'utf-8');

    // Render template with data
    const eta = new Eta({
        views: path.join(import.meta.dir, "../report")
    });
    const html = eta.renderString(template, {
        dataJson: JSON.stringify(sortedHistory),
        scenarioNamesJson: JSON.stringify(Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, v.name]))),
        actualScenariosJson: JSON.stringify(actualScenarios)
    });

    fs.writeFileSync(REPORT_PATH, html);
    return REPORT_PATH;
}
