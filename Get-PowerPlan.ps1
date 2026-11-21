$output = & powercfg.exe /getactivescheme
if ($LASTEXITCODE -ne 0) {
    throw "powercfg failed with exit code $LASTEXITCODE."
}
$output
