"""
AI Sales Lead Intelligence Platform — Custom Lead Scoring Worker
===============================================================
Scores custom CSV files against the trained model PKL on the fly,
and saves the output to scored_leads.csv.
"""

import sys
import os
import pandas as pd
import joblib
import json
import numpy as np

# Column mapping for feature importance human-friendly labels
HUMAN_READABLE = {
    "website_visits":                   "High website visits",
    "response_time_hours":              "Fast response time",
    "days_since_last_contact":          "Recent contact",
    "company_size_Enterprise":          "Enterprise company size",
    "company_size_Mid":                 "Mid-size company",
    "company_size_Small":               "Small company size",
    "industry_SaaS":                    "SaaS industry fit",
    "industry_Finance":                 "Finance industry fit",
    "industry_Healthcare":              "Healthcare industry",
    "industry_Manufacturing":           "Manufacturing industry",
    "industry_Retail":                  "Retail industry",
    "demo_requested_Yes":               "Demo was requested",
    "demo_requested_No":                "No demo requested",
    "source_Referral":                  "Referral lead source",
    "source_Organic":                   "Organic lead source",
    "source_Paid":                      "Paid lead source",
    "source_Cold Outreach":             "Cold outreach source",
}

NUMERIC_FEATURES  = ["website_visits", "response_time_hours", "days_since_last_contact"]
CATEGORICAL_FEATURES = ["company_size", "industry", "demo_requested", "source"]

def _top3_factors_for_row(row, fi_series):
    active = []
    for feat, importance in fi_series.items():
        parts = feat.split("_", 1)
        col   = parts[0] if len(parts) == 1 else parts[0]
        val   = parts[1] if len(parts) > 1 else None

        triggered = False
        if feat == "website_visits":
            triggered = row.get("website_visits", 0) >= 10
        elif feat == "response_time_hours":
            triggered = row.get("response_time_hours", 99) < 12
        elif feat == "days_since_last_contact":
            triggered = row.get("days_since_last_contact", 99) <= 7
        elif val is not None:
            for c in CATEGORICAL_FEATURES:
                if feat.startswith(c + "_"):
                    cat_val = feat[len(c) + 1:]
                    if row.get(c) == cat_val:
                        triggered = True
                    break

        if triggered:
            label = HUMAN_READABLE.get(feat, feat)
            active.append((label, importance))

    active.sort(key=lambda x: x[1], reverse=True)
    top3 = [label for label, _ in active[:3]]
    if not top3:
        top3 = ["Insufficient data to determine factors"]
    return " | ".join(top3)

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Missing arguments. Usage: python score_custom_leads.py input.csv output.csv model.pkl"}))
        sys.exit(1)

    input_csv = sys.argv[1]
    output_csv = sys.argv[2]
    model_pkl = sys.argv[3]

    if not os.path.exists(input_csv):
        print(json.dumps({"error": f"Input file not found: {input_csv}"}))
        sys.exit(1)

    if not os.path.exists(model_pkl):
        print(json.dumps({"error": f"Model pkl not found: {model_pkl}. Train a model first."}))
        sys.exit(1)

    # 1. Load data
    try:
        df = pd.read_csv(input_csv)
    except Exception as e:
        print(json.dumps({"error": f"Failed to read CSV: {str(e)}"}))
        sys.exit(1)

    # 2. Validate columns
    required_cols = [
        "company_id", "company_name", "industry", "company_size", 
        "website_visits", "demo_requested", "source", 
        "response_time_hours", "days_since_last_contact", "sales_person_id"
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        print(json.dumps({"error": f"Missing required columns: {', '.join(missing)}"}))
        sys.exit(1)

    # 3. Load model
    try:
        model = joblib.load(model_pkl)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model file: {str(e)}"}))
        sys.exit(1)

    # 4. Extract features
    try:
        # Check if model has a feature list or feature importance
        clf = model.named_steps["clf"]
        preprocessor = model.named_steps["pre"]
        
        # Get feature names from ColumnTransformer
        num_names = NUMERIC_FEATURES
        cat_encoder = preprocessor.named_transformers_["cat"]
        cat_names = cat_encoder.get_feature_names_out(CATEGORICAL_FEATURES).tolist()
        feature_names = num_names + cat_names

        if hasattr(clf, "feature_importances_"):
            importances = clf.feature_importances_
        elif hasattr(clf, "coef_"):
            importances = np.abs(clf.coef_[0])
        else:
            importances = np.ones(len(feature_names))

        fi_series = pd.Series(importances, index=feature_names).sort_values(ascending=False)
    except Exception as e:
        # Fallback if feature names can't be parsed
        fi_series = pd.Series()

    # 5. Predict probabilities
    try:
        # Prepare scoring dataframe
        score_df = df.copy()
        X = score_df.drop(columns=["converted", "conversion_probability", "top_3_contributing_factors"], errors="ignore")
        
        # Keep only features required by preprocessor
        X_features = X[["company_size", "industry", "website_visits", "demo_requested", "source", "response_time_hours", "days_since_last_contact"]]
        
        probs = model.predict_proba(X_features)[:, 1]
        df["conversion_probability"] = probs.round(4)

        factors = []
        for _, row in df.iterrows():
            factors.append(_top3_factors_for_row(row.to_dict(), fi_series))
        df["top_3_contributing_factors"] = factors
        
        # Save output
        df.to_csv(output_csv, index=True, index_label="lead_id")
        print(json.dumps({"success": True, "count": len(df), "output": output_csv}))
    except Exception as e:
        print(json.dumps({"error": f"Failed during lead scoring: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
