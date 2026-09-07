Synthetic SRTM regression data, generated locally with codec-openjpeg 1.3.5 (lossless JPEG2000 codestream inside a minimal JP2 container). No third-party terrain samples are embedded.

- `srtm-signed.jp2`: 8×8, signed 16-bit; four groups of 16 samples: 100, -25, -32768 (void), 32767.
- `srtm-3601.jp2`: 3601×3601, signed 16-bit; first three samples -25, -32768, 32767; all other samples 100.
- `srtm-download-preload.cjs`: test-only HTTPS simulation injected through fork execArgv. Production code has no mock-network switch.
