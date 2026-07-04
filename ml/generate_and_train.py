"""
AI Sales Lead Intelligence Platform — ML Pipeline
==================================================
Generates a synthetic dataset, trains and compares 3 models,
selects the best, and outputs scored_leads.csv + best_model.pkl.
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
from faker import Faker
import joblib
from tabulate import tabulate

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report,
)
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")
np.random.seed(42)
fake = Faker()
Faker.seed(42)

# ---------------------------------------------------------------------------
# 1. SYNTHETIC DATA GENERATION
# ---------------------------------------------------------------------------

def generate_dataset(n=1500):
    """Generate realistic synthetic lead data with multiple leads per company."""

    company_sizes   = ["Small", "Mid", "Enterprise"]
    industries      = ["SaaS", "Finance", "Healthcare", "Manufacturing", "Retail"]
    sources         = ["Organic", "Paid", "Referral", "Cold Outreach"]

    # Fixed pool of companies to ensure each has plenty of leads
    company_pool = [
        "Davis and Sons", "Blake and Sons", "Doyle Ltd", "Hernandez Ltd", 
        "Diaz-Frederick", "CloudNine SaaS", "Acme Corp", "Globex Corporation", 
        "Initech LLC", "Umbrella Corp", "Veer Technologies", "Pied Piper", 
        "Hooli Inc", "Stark Industries", "Wayne Enterprises", "Soylent Corp", 
        "Wonka Industries", "Cyberdyne Systems", "Tyrell Corporation", "Aperture Science",
        "Sterling Cooper", "Dunder Mifflin", "Gekko & Co", "Oscorp Industries",
        "Vandelay Industries", "Bluth Company", "Sloan & Partners", "Summit Solutions",
        "Nexus Logistics", "Pinnacle Capital", "Horizon Healthcare", "Cascade Retail",
        "Omni Consumer Products", "Virtucon", "Ansel Manufacturing"
    ]

    # Sales Rep Roster with specialized coverage
    reps_by_industry = {
        "Retail": [("SP-01", "Rahul Kumar")],
        "SaaS": [("SP-02", "Priya Menon")],
        "Healthcare": [("SP-03", "Arjun Nair")],
        "Manufacturing": [("SP-04", "Divya Reddy")],
        "Finance": [("SP-05", "Karthik S")],
    }
    reps_indexes = {ind: 0 for ind in industries}

    rows = []
    for i in range(n):
        company_size       = np.random.choice(company_sizes, p=[0.45, 0.35, 0.20])
        industry           = np.random.choice(industries,    p=[0.30, 0.20, 0.20, 0.15, 0.15])
        source             = np.random.choice(sources,        p=[0.30, 0.25, 0.25, 0.20])
        website_visits     = int(np.random.exponential(scale=12) + 1)
        demo_requested     = np.random.choice(["Yes", "No"],  p=[0.30, 0.70])
        response_time_hrs  = round(max(0.5, np.random.exponential(scale=24)), 1)
        days_since_contact = int(np.random.exponential(scale=10) + 1)

        # -------------------------------------------------------------------
        # Conversion probability construction (realistic correlations)
        # -------------------------------------------------------------------
        base_prob = 0.12

        # Demo requested is the strongest signal
        if demo_requested == "Yes":
            base_prob += 0.40

        # High website visits → higher engagement
        if website_visits >= 20:
            base_prob += 0.20
        elif website_visits >= 10:
            base_prob += 0.10

        # Referral leads convert best
        if source == "Referral":
            base_prob += 0.15
        elif source == "Organic":
            base_prob += 0.05
        elif source == "Cold Outreach":
            base_prob -= 0.05

        # Enterprise companies convert at higher rates (budget / authority)
        if company_size == "Enterprise":
            base_prob += 0.15
        elif company_size == "Small":
            base_prob -= 0.05

        # SaaS & Finance are better fit industries
        if industry in ["SaaS", "Finance"]:
            base_prob += 0.08
        elif industry == "Retail":
            base_prob -= 0.05

        # Faster response → higher conversion
        if response_time_hrs < 2:
            base_prob += 0.10
        elif response_time_hrs > 48:
            base_prob -= 0.10

        # Recency of contact matters
        if days_since_contact <= 3:
            base_prob += 0.05
        elif days_since_contact > 21:
            base_prob -= 0.08

        # Clamp to [0.02, 0.95] and sample binary outcome
        prob = np.clip(base_prob, 0.02, 0.95)
        converted = int(np.random.binomial(1, prob))

        company_id = f"CMP-{1001 + (i % len(company_pool))}"
        company_name = company_pool[i % len(company_pool)]
        
        rep_candidates = reps_by_industry.get(industry, [("SP-01", "Rahul Kumar")])
        idx = reps_indexes[industry] % len(rep_candidates)
        sales_person_id, assigned_sales_person = rep_candidates[idx]
        reps_indexes[industry] += 1

        rows.append({
            "company_id":             company_id,
            "company_name":           company_name,
            "sales_person_id":         sales_person_id,
            "assigned_sales_person":   assigned_sales_person,
            "company_size":           company_size,
            "industry":               industry,
            "website_visits":         website_visits,
            "demo_requested":         demo_requested,
            "source":                 source,
            "response_time_hours":    response_time_hrs,
            "days_since_last_contact": days_since_contact,
            "converted":              converted,
        })

    df = pd.DataFrame(rows)
    print(f"[Dataset] {len(df)} rows generated | "
          f"Conversion rate: {df['converted'].mean():.1%}")
    print(df.head())
    return df


# ---------------------------------------------------------------------------
# 2. PREPROCESSING
# ---------------------------------------------------------------------------

NUMERIC_FEATURES  = ["website_visits", "response_time_hours", "days_since_last_contact"]
CATEGORICAL_FEATURES = ["company_size", "industry", "demo_requested", "source"]
TARGET            = "converted"


def build_preprocessor():
    return ColumnTransformer(transformers=[
        ("num", StandardScaler(),                                     NUMERIC_FEATURES),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_FEATURES),
    ])


# ---------------------------------------------------------------------------
# 3. MODEL TRAINING & EVALUATION
# ---------------------------------------------------------------------------

def evaluate(name, model, X_train, X_test, y_train, y_test):
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    return {
        "Model":     name,
        "Accuracy":  round(accuracy_score(y_test, y_pred),            4),
        "Precision": round(precision_score(y_test, y_pred, zero_division=0), 4),
        "Recall":    round(recall_score(y_test, y_pred, zero_division=0), 4),
        "F1":        round(f1_score(y_test, y_pred, zero_division=0), 4),
    }, model


def train_and_compare(df):
    X = df.drop(columns=[TARGET, "company_id", "company_name", "sales_person_id", "assigned_sales_person"])
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    preprocessor = build_preprocessor()

    # Positive class weight for imbalance handling
    pos_weight = int((y_train == 0).sum() / max((y_train == 1).sum(), 1))

    models = {
        "Logistic Regression": Pipeline([
            ("pre", preprocessor),
            ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)),
        ]),
        "Random Forest": Pipeline([
            ("pre", preprocessor),
            ("clf", RandomForestClassifier(
                n_estimators=200, class_weight="balanced",
                random_state=42, n_jobs=-1
            )),
        ]),
        "XGBoost": Pipeline([
            ("pre", preprocessor),
            ("clf", XGBClassifier(
                n_estimators=200,
                scale_pos_weight=pos_weight,
                use_label_encoder=False,
                eval_metric="logloss",
                random_state=42,
                verbosity=0,
            )),
        ]),
    }

    results = []
    trained_models = {}
    for name, pipeline in models.items():
        print(f"  Training {name}...")
        metrics, trained = evaluate(name, pipeline, X_train, X_test, y_train, y_test)
        results.append(metrics)
        trained_models[name] = trained

    results_df = pd.DataFrame(results).sort_values("F1", ascending=False)
    print("\n" + "=" * 60)
    print("MODEL COMPARISON (test set)")
    print("=" * 60)
    print(tabulate(results_df, headers="keys", tablefmt="grid", showindex=False))

    best_name = results_df.iloc[0]["Model"]
    best_model = trained_models[best_name]
    print(f"\n[BEST] Best model: {best_name} (F1 = {results_df.iloc[0]['F1']})")
    return best_model, best_name, preprocessor, X_train, X_test, y_train, y_test, trained_models


# ---------------------------------------------------------------------------
# 4. FEATURE IMPORTANCE
# ---------------------------------------------------------------------------

def get_feature_names(preprocessor):
    """Return ordered feature names after ColumnTransformer."""
    num_names = NUMERIC_FEATURES
    cat_encoder = preprocessor.named_transformers_["cat"]
    cat_names = cat_encoder.get_feature_names_out(CATEGORICAL_FEATURES).tolist()
    return num_names + cat_names


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


def extract_feature_importance(best_model, best_name, preprocessor):
    clf = best_model.named_steps["clf"]
    feature_names = get_feature_names(preprocessor)

    if hasattr(clf, "feature_importances_"):
        importances = clf.feature_importances_
    elif hasattr(clf, "coef_"):
        importances = np.abs(clf.coef_[0])
    else:
        importances = np.ones(len(feature_names))

    fi = pd.Series(importances, index=feature_names).sort_values(ascending=False)
    print("\nTop 10 Feature Importances:")
    print(fi.head(10).to_string())
    return fi


# ---------------------------------------------------------------------------
# 5. SCORE ALL LEADS + TOP-3 CONTRIBUTING FACTORS
# ---------------------------------------------------------------------------

def _top3_factors_for_row(row, fi_series):
    """
    For a single lead row (dict), return the top-3 human-readable factors
    that most influenced the score. We use the global feature importance
    ranking intersected with the features that are 'active' for this lead.
    """
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
            # categorical one-hot: check if row's column value matches
            col_name = "_".join(feat.split("_")[:-1]) if feat.count("_") > 1 else feat.split("_")[0]
            # derive column name from feature name prefix
            for c in CATEGORICAL_FEATURES:
                if feat.startswith(c + "_"):
                    cat_val = feat[len(c) + 1:]
                    if row.get(c) == cat_val:
                        triggered = True
                    break

        if triggered:
            label = HUMAN_READABLE.get(feat, feat)
            active.append((label, importance))

    # sort by importance desc, take top 3
    active.sort(key=lambda x: x[1], reverse=True)
    top3 = [label for label, _ in active[:3]]
    if not top3:
        top3 = ["Insufficient data to determine factors"]
    return " | ".join(top3)


def score_leads(df, best_model, fi_series):
    X = df.drop(columns=[TARGET, "company_id", "company_name", "sales_person_id", "assigned_sales_person"])
    probs = best_model.predict_proba(X)[:, 1]
    df = df.copy()
    df["conversion_probability"] = probs.round(4)

    factors = []
    for _, row in df.iterrows():
        factors.append(_top3_factors_for_row(row.to_dict(), fi_series))
    df["top_3_contributing_factors"] = factors
    return df


# ---------------------------------------------------------------------------
# 6. MAIN
# ---------------------------------------------------------------------------

def main():
    output_dir = os.path.dirname(os.path.abspath(__file__))

    print("\n" + "=" * 60)
    print("STEP 1: Generating synthetic dataset")
    print("=" * 60)
    df = generate_dataset(n=1500)
    raw_csv = os.path.join(output_dir, "raw_leads.csv")
    df.to_csv(raw_csv, index=False)
    print(f"  Saved raw leads -> {raw_csv}")

    print("\n" + "=" * 60)
    print("STEP 2: Training & comparing models")
    print("=" * 60)
    (
        best_model, best_name, preprocessor,
        X_train, X_test, y_train, y_test, all_models
    ) = train_and_compare(df)

    print("\n" + "=" * 60)
    print("STEP 3: Extracting feature importance")
    print("=" * 60)
    # Fit preprocessor separately to get feature names
    preprocessor.fit(df.drop(columns=[TARGET, "company_id", "company_name", "sales_person_id", "assigned_sales_person"]))
    fi_series = extract_feature_importance(best_model, best_name, preprocessor)

    print("\n" + "=" * 60)
    print("STEP 4: Scoring all leads")
    print("=" * 60)
    scored_df = score_leads(df, best_model, fi_series)
    scored_csv = os.path.join(output_dir, "scored_leads.csv")
    scored_df.to_csv(scored_csv, index=True, index_label="lead_id")
    print(f"  Saved scored leads -> {scored_csv}")
    print(f"  Sample:\n{scored_df[['company_size','industry','conversion_probability','top_3_contributing_factors']].head(5).to_string()}")

    print("\n" + "=" * 60)
    print("STEP 5: Saving best model")
    print("=" * 60)
    model_path = os.path.join(output_dir, "best_model.pkl")
    joblib.dump(best_model, model_path)
    meta_path  = os.path.join(output_dir, "model_meta.json")
    with open(meta_path, "w") as f:
        json.dump({"best_model": best_name}, f, indent=2)
    print(f"  Saved model      -> {model_path}")
    print(f"  Saved meta       -> {meta_path}")

    print("\n[DONE] Pipeline complete!")
    print(f"   Best model : {best_name}")
    print(f"   Leads scored: {len(scored_df)}")
    print(f"   Output CSV  : {scored_csv}")


if __name__ == "__main__":
    main()
