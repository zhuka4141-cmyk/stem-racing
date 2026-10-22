"""Longitudinal + yaw model for a guided CO2 dragster.

Every number printed by this file comes out of the integration below; nothing is
hard-coded into the video. Constants carry the racing-physics tags:
  [fixed]   physics constant, trustworthy as written
  [typical] plausible, must be measured on the real car
  [VERIFY]  comes from a rulebook / supplier sheet we did not read

Run:  python model.py --episode ../../episodes/why-it-veer.json --out ../../out/physics.json
"""
from __future__ import annotations

import argparse
import json
import math
import os

G = 9.81            # [fixed] m/s^2
RHO = 1.204         # [fixed] kg/m^3, dry air 20 C, sea level
ALPHA_PEAK = 0.12   # [typical] slip angle at which a hard tyre reaches mu*N


def simulate(cfg: dict, cm_offset_m: float) -> dict:
    """Integrate one run to the finish. Returns summary numbers + a 5 ms trace."""
    m = cfg["mass_kg"]                       # [typical] 50-65 g
    A = cfg["frontal_area_m2"]               # [typical] measure your own body
    Cd = cfg["drag_coeff"]                   # [typical]
    Crr = cfg["rolling_resistance"]          # [typical]
    r_w = cfg["wheel_radius_m"]              # [typical]
    m_w = cfg["wheel_mass_kg"]               # [typical]
    L = cfg["track_length_m"]                # [VERIFY] competition spec
    F0 = cfg["thrust_peak_n"]                # [typical] sanity-checked, see README
    tau = cfg["thrust_tau_s"]                # [typical]
    mu = cfg["tyre_friction"]                # [typical]
    mu_rail = cfg["rail_friction"]           # [typical]
    L_nose = cfg["pin_to_nose_m"]
    L_axle = cfg["pin_to_front_axle_m"]
    gap = cfg["nose_rail_gap_m"]
    front_share = cfg["front_load_share"]
    I_com = cfg["yaw_inertia_com"]
    l_pin_com = cfg["pin_to_com_m"]

    I_w = 0.5 * m_w * r_w ** 2               # [fixed] treat wheel as a disc
    m_eff = m + 4 * I_w / r_w ** 2           # effective mass, racing-physics 1
    I_pin = I_com + m * (l_pin_com ** 2 + cm_offset_m ** 2)   # parallel axis
    N_front = front_share * m * G
    M_tyre_max = mu * N_front * L_axle       # yaw moment the front tyres can hold
    C_f = mu * N_front / ALPHA_PEAK          # cornering stiffness, N/rad

    dt = 1e-4
    t = s = v = psi = psi_dot = 0.0
    trace = []
    contact_s = None
    psi_lock = 0.0
    M_peak = N_rail_peak = work_rail = 0.0

    while s < L and t < 6.0:
        F_thrust = F0 * math.exp(-t / tau)
        F_drag = 0.5 * RHO * Cd * A * v * v
        F_roll = Crr * m * G

        # rail drag and wheel scrub both depend on a, and a depends on them,
        # so the coupled step is settled in three passes
        a = (F_thrust - F_drag - F_roll) / m_eff
        in_contact = contact_s is not None
        # once crabbed by psi every wheel runs at that toe angle -> scrub drag
        # (racing-physics 3: mu*N*sin(theta) per wheel, summed over four)
        F_scrub = mu * m * G * math.sin(abs(psi)) if in_contact else 0.0
        N_rail = 0.0
        for _ in range(3):
            M_drive = m * a * cm_offset_m
            N_rail = max(0.0, abs(M_drive) - M_tyre_max) / L_nose if in_contact else 0.0
            F_rail = mu_rail * N_rail if in_contact else 0.0
            a = (F_thrust - F_drag - F_roll - F_rail - F_scrub) / m_eff

        M_drive = m * a * cm_offset_m
        M_peak = max(M_peak, abs(M_drive))
        if in_contact:
            N_rail_peak = max(N_rail_peak, N_rail)
            work_rail += mu_rail * N_rail * v * dt

        if not in_contact:
            M_net = abs(M_drive) - min(M_tyre_max, abs(M_drive))
            if cm_offset_m < 0:
                M_net = -M_net
            b = C_f * L_axle ** 2 / max(v, 1.0)         # viscous yaw damping, N m s/rad
            psi_dot += ((M_net - b * psi_dot) / I_pin) * dt
            psi += psi_dot * dt
            if L_nose * math.sin(psi) >= gap:
                psi = math.asin(gap / L_nose)
                psi_lock = psi
                contact_s = s
                psi_dot = 0.0

        v += a * dt
        s += v * dt
        t += dt

        if not trace or (t - trace[-1]["t"]) >= 4.5e-3:
            trace.append({
                "t": round(t, 5), "s": round(s, 5), "v": round(v, 5), "a": round(a, 2),
                "psi_deg": round(math.degrees(psi), 4),
                "nose_mm": round(L_nose * math.sin(psi) * 1000.0, 4),
                "M_mNm": round(abs(M_drive) * 1000.0, 3),
                "N_rail_mN": round(N_rail * 1000.0, 3),
            })

    return {
        "run_time_s": round(t, 5),
        "exit_speed_ms": round(v, 4),
        "contact_s_m": None if contact_s is None else round(contact_s, 4),
        "M_peak_mNm": round(M_peak * 1000.0, 3),
        "M_tyre_max_mNm": round(M_tyre_max * 1000.0, 3),
        "N_rail_peak_mN": round(N_rail_peak * 1000.0, 3),
        "rail_work_J": round(work_rail, 4),
        "psi_lock_deg": round(math.degrees(psi_lock), 3),
        "nose_end_mm": round(L_nose * math.sin(psi) * 1000.0, 3),
        "m_eff_kg": round(m_eff, 5),
        "I_pin_kgm2": round(I_pin, 9),
        "trace": trace,
    }


def analyse(cfg: dict) -> dict:
    d = cfg["cm_offset_m"]
    ref = simulate(cfg, 0.0)
    run = simulate(cfg, d)
    a_peak = max(p["a"] for p in run["trace"])
    M_tyre_max = run["M_tyre_max_mNm"] / 1000.0
    d_crit_mm = M_tyre_max / (cfg["mass_kg"] * a_peak) * 1000.0

    return {
        "cm_offset_mm": round(d * 1000.0, 3),
        "critical_offset_mm": round(d_crit_mm, 3),
        "over_critical_x": round(d * 1000.0 / d_crit_mm, 2),
        "reference": {k: v for k, v in ref.items() if k != "trace"},
        "run": {k: v for k, v in run.items() if k != "trace"},
        "delta_t_s": round(run["run_time_s"] - ref["run_time_s"], 4),
        "a_peak_ms2": round(a_peak, 2),
        "trace": run["trace"],
        "sanity": {
            "ref_run_time_in_band": 1.0 <= ref["run_time_s"] <= 1.25,
            "band_s": [1.0, 1.25],
            "ref_exit_speed_in_band": 15.0 <= ref["exit_speed_ms"] <= 20.0,
            "ke_translate_J": round(0.5 * cfg["mass_kg"] * ref["exit_speed_ms"] ** 2, 3),
            "impulse_ns": round(cfg["thrust_peak_n"] * cfg["thrust_tau_s"], 4),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    with open(a.episode, "r", encoding="utf-8") as f:
        ep = json.load(f)
    res = analyse(ep["physics"])
    res["episode_id"] = ep["id"]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)

    r, ref, sa = res["run"], res["reference"], res["sanity"]
    print(f"m_eff                 {ref['m_eff_kg']} kg")
    print(f"reference 20 m        {ref['run_time_s']} s   v_end {ref['exit_speed_ms']} m/s")
    print(f"our car 20 m          {r['run_time_s']} s   v_end {r['exit_speed_ms']} m/s")
    print(f"delta t               {res['delta_t_s']} s")
    print(f"a peak                {res['a_peak_ms2']} m/s^2")
    print(f"M peak                {r['M_peak_mNm']} mN.m")
    print(f"M tyre ceiling        {r['M_tyre_max_mNm']} mN.m")
    print(f"critical offset       {res['critical_offset_mm']} mm  (ours {res['over_critical_x']}x)")
    print(f"contact at            {r['contact_s_m']} m  /  psi {r['psi_lock_deg']} deg")
    print(f"nose at 20 m          {r['nose_end_mm']} mm")
    print(f"N rail peak           {r['N_rail_peak_mN']} mN")
    print(f"rail work             {r['rail_work_J']} J")
    print(f"sanity                {sa}")


if __name__ == "__main__":
    main()
