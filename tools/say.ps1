# Offline narration via the Windows speech engine.
# Used by tools/make_demo.py when edge-tts cannot reach the network.
# Usage: powershell -File tools/say.ps1 -Text "..." -Out out.wav [-Voice "Microsoft David Desktop"]
param(
  [Parameter(Mandatory = $true)][string]$Text,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Voice = "Microsoft David Desktop",
  [int]$Rate = 1
)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($Voice) } catch { }
$synth.Rate = $Rate
$synth.SetOutputToWaveFile($Out)
$synth.Speak($Text)
$synth.Dispose()
