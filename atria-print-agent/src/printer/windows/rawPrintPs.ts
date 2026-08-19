/**
 * Script PowerShell: Winspool RAW (OpenPrinter → StartDocPrinter RAW → WritePrinter).
 * Invocado con `powershell -File print-raw.ps1 -PrinterName … -FilePath …`.
 */
export const WIN_RAW_PRINT_PS = `
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath,
  [string]$DocName = 'atria-print-agent'
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class AtriaRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterA", CharSet=CharSet.Ansi, SetLastError=true)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", CharSet=CharSet.Ansi, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static string SendFile(string printer, string docName, string path) {
    byte[] bytes = System.IO.File.ReadAllBytes(path);
    IntPtr hPrinter;
    if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) {
      return "OPEN_FAILED:" + Marshal.GetLastWin32Error();
    }
    var di = new DOCINFOA();
    di.pDocName = docName;
    di.pDataType = "RAW";
    if (!StartDocPrinter(hPrinter, 1, di)) {
      int err = Marshal.GetLastWin32Error();
      ClosePrinter(hPrinter);
      return "STARTDOC_FAILED:" + err;
    }
    StartPagePrinter(hPrinter);
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written;
    bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
    int writeErr = Marshal.GetLastWin32Error();
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    if (!ok) return "WRITE_FAILED:" + writeErr;
    return "OK:" + written;
  }
}
"@
try {
  $result = [AtriaRawPrinter]::SendFile($PrinterName, $DocName, $FilePath)
  if ($result -like 'OK:*') {
    Write-Output $result
    exit 0
  }
  Write-Error $result
  exit 1
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`.trim();
