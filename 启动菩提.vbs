Option Explicit

Dim fso, shell, shellApp, baseDir, indexPath, fileUrl, browserPath, candidates, candidate, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set shellApp = CreateObject("Shell.Application")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
indexPath = fso.BuildPath(baseDir, "index.html")
fileUrl = Replace(indexPath, "\", "/")
fileUrl = Replace(fileUrl, "%", "%25")
fileUrl = Replace(fileUrl, " ", "%20")
fileUrl = Replace(fileUrl, "#", "%23")
fileUrl = Replace(fileUrl, "?", "%3F")
If Left(fileUrl, 1) = "/" Then
  fileUrl = "file://" & fileUrl
Else
  fileUrl = "file:///" & fileUrl
End If

browserPath = ""
candidates = Array( _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"), _
  shell.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"), _
  shell.ExpandEnvironmentStrings("%LocalAppData%\Microsoft\Edge\Application\msedge.exe"), _
  shell.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
  shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"), _
  shell.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe") _
)

For i = 0 To UBound(candidates)
  candidate = candidates(i)
  If fso.FileExists(candidate) Then
    browserPath = candidate
    Exit For
  End If
Next

If browserPath <> "" Then
  shell.Run """" & browserPath & """ --app=""" & fileUrl & """ --window-size=1380,880", 1, False
Else
  shellApp.ShellExecute fileUrl, "", "", "open", 1
End If
