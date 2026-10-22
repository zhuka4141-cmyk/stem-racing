"""Pick thrust parameters whose 20 m run lands inside the racing-physics sanity band."""
import copy
import json
import sys

sys.path.insert(0, r"C:\Users\lstcstudent\OneDrive\Desktop\deeepseek\_stemlab\projects\why-it-veer\src\physics")
import model  # noqa: E402

ep = json.load(open(r"C:\Users\lstcstudent\OneDrive\Desktop\deeepseek\_stemlab\projects\why-it-veer\episodes\why-it-veer.json", encoding="utf-8"))
base = ep["physics"]

print(f"{'F0':>5} {'tau':>5} {'J':>6} {'t20':>7} {'vend':>7} {'apeak':>7} {'dCrit':>7}")
for F0 in (4.2, 4.6, 5.0, 5.4, 5.8):
    for tau in (0.26, 0.30, 0.34):
        c = copy.deepcopy(base)
        c["thrust_peak_n"], c["thrust_tau_s"] = F0, tau
        ref = model.simulate(c, 0.0)
        run = model.simulate(c, c["cm_offset_m"])
        a_peak = max(p["a"] for p in run["trace"])
        M_t = run["M_tyre_max_mNm"] / 1000.0
        dcrit = M_t / (c["mass_kg"] * a_peak) * 1000
        ok = "OK " if (1.0 <= ref["run_time_s"] <= 1.25 and 15.0 <= ref["exit_speed_ms"] <= 20.0) else "   "
        print(f"{F0:5.1f} {tau:5.2f} {F0*tau:6.2f} {ref['run_time_s']:7.3f} "
              f"{ref['exit_speed_ms']:7.2f} {a_peak:7.1f} {dcrit:7.2f} {ok}")
