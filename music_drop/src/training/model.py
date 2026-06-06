from sklearn.ensemble import ExtraTreesClassifier


# model = ExtraTreesClassifier(
#     n_estimators=500,
#     max_features="sqrt",
#     min_samples_leaf=2,
#     class_weight="balanced",
#     random_state=0
# )

def model():
    return ExtraTreesClassifier(
        n_estimators=500,
        max_features="sqrt",
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=0
    )