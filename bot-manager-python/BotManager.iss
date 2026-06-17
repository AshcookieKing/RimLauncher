; Скрипт установщика Inno Setup для Bot Manager
; Требуется Inno Setup 6 или выше

#define AppName "Ziliron Bot Manager"
#define AppVersion "1.0"
#define AppPublisher "Ziliron"
#define AppURL "https://github.com/ziliron"
#define AppExeName "BotManager.exe"
#define OutputDir "dist"
#define SourceDir "dist"

[Setup]
; Основные настройки
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=
OutputDir={#OutputDir}
OutputBaseFilename=BotManager_Setup
SetupIconFile=icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64

; Языки
[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1
Name: "installnode"; Description: "Установить зависимости Node.js (требуется package.json в папке установки)"; GroupDescription: "Дополнительно:"; Flags: unchecked

[Files]
; Основной exe файл
Source: "{#SourceDir}\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; Иконка
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion
; README
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
; Скрипт установки зависимостей
Source: "install_node_dependencies.bat"; DestDir: "{app}"; Flags: ignoreversion

; Все файлы ботов из папки resources
Source: "resources\*.js"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs
Source: "resources\*.json"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs
Source: "resources\*.dll"; DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs
Source: "resources\commands\*"; DestDir: "{app}\resources\commands"; Flags: ignoreversion recursesubdirs
Source: "resources\public\*"; DestDir: "{app}\resources\public"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; IconFilename: "{app}\icon.ico"
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: quicklaunchicon; IconFilename: "{app}\icon.ico"

[Run]
; Запуск установки зависимостей Node.js (только если выбрана опция)
; Устанавливаем зависимости в папку resources где находятся файлы ботов
Filename: "{cmd}"; Parameters: "/c cd /d ""{app}\resources"" && if exist package.json (npm install)"; Description: "Установить зависимости Node.js"; Flags: waituntilterminated; Tasks: installnode; StatusMsg: "Установка зависимостей Node.js..."
; Запуск приложения после установки
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
function CheckFileExists(FileName: String): Boolean;
begin
  Result := FileExists(ExpandConstant(FileName));
end;

function InitializeSetup(): Boolean;
var
  ErrorCode: Integer;
begin
  Result := True;
  
  // Проверяем наличие Node.js (не блокируем установку, только предупреждаем)
  if not Exec('node', '--version', '', SW_HIDE, ewWaitUntilTerminated, ErrorCode) then
  begin
    // Node.js не найден - показываем предупреждение, но не блокируем установку
    if MsgBox('ВНИМАНИЕ: Node.js не найден в системе.' + #13#10 + #13#10 + 
              'Боты не смогут работать без Node.js.' + #13#10 + 
              'Рекомендуется установить Node.js перед использованием приложения.' + #13#10 + #13#10 +
              'Скачать Node.js: https://nodejs.org/' + #13#10 + #13#10 +
              'Продолжить установку приложения?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
    end;
  end;
end;

