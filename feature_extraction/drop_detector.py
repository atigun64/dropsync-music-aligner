import numpy as np
from utils import robust_scale, robust_z, sigmoid

def score_beats(E, O, B):
    E = np.asarray(E, dtype=float)
    O = np.asarray(O, dtype=float)
    B = np.asarray(B, dtype=float)

    n = min(len(E), len(O), len(B))
    E = E[:n]
    O = O[:n]
    B = B[:n]

    Ez = robust_z(E)
    Oz = robust_z(O)
    Bz = robust_z(B)

    score = np.zeros(n, dtype=float)

    for i in range(20, n - 10):
        early = slice(i - 12, i - 8)
        late = slice(i - 8, i - 4)
        post = slice(i, i + 4)

        early_E = np.mean(Ez[early])
        late_E = np.mean(Ez[late])
        post_E = np.mean(Ez[post])

        early_O = np.mean(Oz[early])
        late_O = np.mean(Oz[late])
        post_O = np.mean(Oz[post])

        early_B = np.mean(Bz[early])
        late_B = np.mean(Bz[late])
        post_B = np.mean(Bz[post])

        energy_jump = post_E - late_E
        onset_jump = post_O - late_O
        bass_jump = post_B - late_B

        build_energy = late_E - early_E
        build_onset = late_O - early_O
        build_bass = late_B - early_B

        q_energy = sigmoid(energy_jump)
        q_onset = sigmoid(onset_jump)
        q_bass = sigmoid(bass_jump)

        q_build = (
            0.5 * sigmoid(build_energy) +
            0.25 * sigmoid(build_onset) +
            0.25 * sigmoid(build_bass)
        )

        q_post = sigmoid(post_E - np.median(Ez))

        score[i] = (
            0.35 * q_energy +
            0.25 * q_onset +
            0.20 * q_bass +
            0.15 * q_build +
            0.05 * q_post
        )

    return score