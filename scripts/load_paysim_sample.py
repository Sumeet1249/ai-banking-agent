import os
import kagglehub
import pandas as pd

print("Downloading ealaxi/paysim1 dataset via kagglehub...")
try:
    path = kagglehub.dataset_download("ealaxi/paysim1")
    print("Path to dataset files:", path)

    files = os.listdir(path)
    print("Files found in directory:", files)

    csv_file = None
    for f in files:
        if f.endswith(".csv"):
            csv_file = os.path.join(path, f)
            break

    if csv_file:
        print(f"Loading first 5 rows from {csv_file}...")
        df = pd.read_csv(csv_file, nrows=5)
        print("\n--- PaySim1 Dataset Schema & Sample Records ---")
        print(df.to_string())
    else:
        print("No CSV file located in download directory.")
except Exception as e:
    print("Error during dataset download/load:", e)
