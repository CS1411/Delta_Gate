import openpyxl, math
from pycel import ExcelCompiler
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "S"
data = [3, 5, -2, 7.5, 10]
for i, v in enumerate(data, 1): ws.cell(i, 1, v)
ws["B1"], ws["B2"] = "a", "b"
tests = {
 "SUM":("=SUM(A1:A5)", 23.5), "MIN":("=MIN(A1:A5)", -2), "MAX":("=MAX(A1:A5)", 10),
 "AVERAGE":("=AVERAGE(A1:A5)", 4.7), "COUNT":("=COUNT(A1:A5)", 5), "COUNTA":("=COUNTA(A1:B2)", 4),
 "IF":("=IF(A1>2,1,0)", 1), "AND":("=IF(AND(A1>2,A2>2),1,0)", 1), "OR":("=IF(OR(A1>9,A2>9),1,0)", 0),
 "NOT":("=IF(NOT(A1>9),1,0)", 1), "ROUND":("=ROUND(A4*1.234,2)", 9.26), "ABS":("=ABS(A3)", 2),
 "INT":("=INT(A4)", 7), "MOD":("=MOD(A5,3)", 1), "SUMIF":("=SUMIF(A1:A5,\">4\")", 22.5),
 "SUMIFS":("=SUMIFS(A1:A5,A1:A5,\">0\",A1:A5,\"<8\")", 15.5), "COUNTIF":("=COUNTIF(A1:A5,\">0\")", 4),
 "SUMPRODUCT":("=SUMPRODUCT(A1:A2,A1:A2)", 34), "IFERROR":("=IFERROR(1/0,99)", 99),
 "VLOOKUP":("=VLOOKUP(5,A1:A5,1,FALSE)", 5), "INDEX":("=INDEX(A1:A5,4)", 7.5), "MATCH":("=MATCH(7.5,A1:A5,0)", 4),
 "LEN":("=LEN(B1)", 1), "ROUNDUP":("=ROUNDUP(A4,0)", 8), "XLOOKUP":("=XLOOKUP(5,A1:A5,A1:A5)", 5),
}
r = 1
cells = {}
for name, (f, exp) in tests.items():
    c = f"D{r}"; ws[c] = f; cells[name] = (c, exp); r += 1
wb.save("fn.xlsx")
xl = ExcelCompiler(filename="fn.xlsx")
for name, (c, exp) in cells.items():
    try:
        v = xl.evaluate(f"S!{c}")
        ok = isinstance(v,(int,float)) and math.isclose(float(v), exp, rel_tol=1e-9, abs_tol=1e-9)
        print(f"{name:10s} {'PASS' if ok else 'FAIL'} got={v!r} exp={exp}")
    except Exception as e:
        print(f"{name:10s} ERROR {type(e).__name__}: {str(e)[:80]}")
