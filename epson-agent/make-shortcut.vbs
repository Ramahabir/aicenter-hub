If WScript.Arguments.Count < 3 Then WScript.Quit 1
shortcutPath = WScript.Arguments(0)
targetScript = WScript.Arguments(1)
workDir = WScript.Arguments(2)

Set WshShell = CreateObject("WScript.Shell")
Set shortcut = WshShell.CreateShortcut(shortcutPath)
shortcut.TargetPath = "wscript.exe"
shortcut.Arguments = """" & targetScript & """"
shortcut.WorkingDirectory = workDir
shortcut.Description = "AI Center UB - Epson L3110 Print Agent"
shortcut.WindowStyle = 7
shortcut.Save
