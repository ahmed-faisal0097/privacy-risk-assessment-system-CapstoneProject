/**
 * Mock results data.
 *
 * TODO: Replace this with a real API response when the backend is ready.
 * Suggested integration points:
 *   - fetch("/api/analyze", { method: "POST", body: formData })
 *   - or pass via router state / context after the upload+analyze step
 */

export type RiskLevel = "High" | "Medium" | "Low";

export interface AnalysisResults {
  uploadedDatasets: {
    real: { name: string; size: string };
    synthetic: { name: string; size: string };
  };
  datasetSummary: {
    rows: string;
    columns: string;
    missingValues: string;
  };
  riskOverview: Array<{
    label: string;
    value: string;
    level: RiskLevel;
  }>;
  variableRiskChart: Array<{
    variable: string;
    score: number;
    attackAccuracy?: number;
    baselineAccuracy?: number;
    gainOverBaseline?: number;
    riskScore?: number;
    explanation?: string;
  }>;
  ageGroupChart: Array<{
    group: string;
    score: number;
  }>;
  variableRiskRanking: Array<{
    rank: number;
    variable: string;
    score: number;
    level: RiskLevel;
    attackAccuracy?: number;
    baselineAccuracy?: number;
    gainOverBaseline?: number;
    riskScore?: number;
    explanation?: string;
  }>;
}

export const mockResults: AnalysisResults = {
  uploadedDatasets: {
    real: { name: "diabetic_data.csv", size: "18710.33 KB" },
    synthetic: { name: "V1_syn.csv", size: "18237.21 KB" },
  },

  datasetSummary: {
    rows: "10,542",
    columns: "18",
    missingValues: "2.3%",
  },

  riskOverview: [
    { label: "Overall Risk Level", value: "6.2/10", level: "Medium" },
    { label: "Uniqueness Risk", value: "8.1/10", level: "High" },
    { label: "Linkage Risk", value: "5.8/10", level: "Medium" },
    { label: "Attribute Inference Risk", value: "3.4/10", level: "Low" },
  ],

  variableRiskChart: [
    { variable: "Blood_Type", score: 1.8 },
    { variable: "Gender", score: 2.1 },
    { variable: "Treatment_Date", score: 4.8 },
    { variable: "Diagnosis_Code", score: 5.2 },
    { variable: "ZIP_Code", score: 6.9 },
    { variable: "Date_of_Birth", score: 7.5 },
    { variable: "Social_Security", score: 8.8 },
    { variable: "Patient_ID", score: 9.2 },
  ],

  ageGroupChart: [
    { group: "Age 18–30", score: 5.8 },
    { group: "Age 31–50", score: 7.2 },
    { group: "Age 51–70", score: 6.5 },
    { group: "Age 70+", score: 8.4 },
  ],

  variableRiskRanking: [
    { rank: 1, variable: "Patient_ID", score: 9.2, level: "High" },
    { rank: 2, variable: "Social_Security", score: 8.8, level: "High" },
    { rank: 3, variable: "Date_of_Birth", score: 7.5, level: "High" },
    { rank: 4, variable: "ZIP_Code", score: 6.9, level: "Medium" },
    { rank: 5, variable: "Diagnosis_Code", score: 5.2, level: "Medium" },
    { rank: 6, variable: "Treatment_Date", score: 4.8, level: "Medium" },
    { rank: 7, variable: "Medical_History", score: 4.1, level: "Medium" },
    { rank: 8, variable: "Insurance_Provider", score: 3.7, level: "Low" },
    { rank: 9, variable: "Gender", score: 2.1, level: "Low" },
    { rank: 10, variable: "Blood_Type", score: 1.8, level: "Low" },
  ],
};
