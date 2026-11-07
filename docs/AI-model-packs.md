# Optional AI model packs — disk and memory needed

Stellura's AI (plain-language questions, written summaries) runs **locally** through Ollama (`app.py`, default model `qwen2.5:7b`, set with `OLLAMA_MODEL`). Every calculation feature works without it. The figures below are **approximate** download sizes of the standard 4-bit builds; re-check them with `ollama list` when the installer is built.

| Pack | Model | Download / disk | RAM while answering | Speed on a typical office PC (no graphics card) | Licence (check before shipping) |
|---|---|---|---|---|---|
| Lite | `qwen2.5:1.5b` | ≈ 1.0 GB | ≈ 2–3 GB | fast, simple questions | Apache 2.0 |
| Standard | `qwen2.5:3b` | ≈ 1.9 GB | ≈ 4 GB | moderate | **Qwen Research License — not free for commercial redistribution; do not bundle without checking** |
| Best (current default) | `qwen2.5:7b` | ≈ 4.7 GB | ≈ 8 GB (16 GB PC recommended) | slow without a graphics card | Apache 2.0 |
| High-end | `qwen2.5:14b` | ≈ 9 GB | ≈ 12–16 GB | needs a strong PC | Apache 2.0 |

Plus the **Ollama program** itself: roughly 0.7–1 GB to download and 1–4 GB installed (it varies with the version and graphics-card libraries).

## Against the size limits (bundle ≤ 1.5 GB, installed ≤ 2 GB)

- **Core Stellura without AI:** about 300–500 MB. Inside the limits with room to spare.
- **Core + Ollama + Lite pack:** about 2–2.5 GB installed. This only fits if the limit is relaxed a little or the pack is downloaded after installation.
- **Standard / Best / High-end:** never inside the bundle. Offer them as a separate "AI pack" download (the installer can fetch it, or the user copies an offline pack file).

## Recommendation

Ship the core app with no model. Add an "AI pack" page after installation: Lite (recommended for 8 GB PCs) and Best (for 16 GB PCs), with the space and memory shown before the user chooses, and the model's licence shown for acceptance.
