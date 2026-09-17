Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c """ & WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\Documents\ChatGPT\AICENTER\scripts\run-tunnel.cmd""", 0, False
