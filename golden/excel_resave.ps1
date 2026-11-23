# Re-save the golden workbooks in real Excel (COM automation) so their cached values are
# Excel's own and docProps/app.xml says "Microsoft Excel".
# Usage (Windows, Excel installed):  powershell -File golden\excel_resave.ps1
# Run golden/recalc.sh first; run this last. Exit code 1 if any formula cell shows an error.
$ErrorActionPreference = 'Stop'

$files = 'dues_v2.xlsx', 'dues_v3_REAL.xlsx', 'judge_xlookup.xlsx' | ForEach-Object { Join-Path $PSScriptRoot $_ }
$checkedSheets = 'LateFees', 'Summary'
# Excel hands error cells to COM as Int32 codes; real numbers arrive as Double.
$errorNames = @{ -2146826288 = '#NULL!'; -2146826281 = '#DIV/0!'; -2146826273 = '#VALUE!'; -2146826265 = '#REF!'
                 -2146826259 = '#NAME?'; -2146826252 = '#NUM!'; -2146826246 = '#N/A' }

function Release($com) { if ($null -ne $com) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($com) } }

$before = @(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object Id)
$bad = 0
$app = New-Object -ComObject Excel.Application
$books = $null
try {
    $app.Visible = $false
    $app.DisplayAlerts = $false
    $books = $app.Workbooks
    foreach ($path in $files) {
        $wb = $books.Open($path)
        $sheets = $wb.Worksheets
        try {
            $app.CalculateFull()
            $checked = 0
            foreach ($name in $checkedSheets) {
                $ws = $sheets.Item($name)
                $used = $ws.UsedRange
                try {
                    # Two bulk reads per sheet instead of one COM object per cell.
                    $formulas = $used.Formula
                    $values = $used.Value2
                    $row0 = $used.Row; $col0 = $used.Column
                    for ($r = 1; $r -le $formulas.GetUpperBound(0); $r++) {
                        for ($c = 1; $c -le $formulas.GetUpperBound(1); $c++) {
                            $formula = $formulas[$r, $c]
                            if ($formula -isnot [string] -or -not $formula.StartsWith('=')) { continue }
                            $checked++
                            $value = $values[$r, $c]
                            if ($value -is [int]) {
                                $bad++
                                $address = '{0}{1}' -f [char](64 + $col0 + $c - 1), ($row0 + $r - 1)  # columns A..Z only
                                Write-Output ("  ERROR {0}!{1} = {2}   {3}" -f $name, $address, $errorNames[$value], $formula)
                            }
                        }
                    }
                }
                finally { Release $used; Release $ws }
            }
            $wb.Save()
            Write-Output ("{0}: {1} formula cells checked on {2}, saved by Excel {3}" -f (Split-Path $path -Leaf), $checked, ($checkedSheets -join '+'), $app.Version)
        }
        finally {
            $wb.Close($false)
            Release $sheets; Release $wb
        }
    }
}
finally {
    $app.Quit()
    Release $books; Release $app
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}

# Our Excel instance must be gone. Excel windows the user already had open are left alone.
$left = $null
foreach ($i in 1..20) {
    $left = @(Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id })
    if (-not $left) { break }
    Start-Sleep -Milliseconds 500
}
if ($left) { Write-Output ("WARNING: EXCEL.EXE still running, pid " + ($left.Id -join ', ')) }
else { Write-Output 'No EXCEL.EXE left running from this script.' }

if ($bad) { Write-Output "$bad formula cell(s) show errors."; exit 1 }
Write-Output 'All checked formula cells are error-free.'
