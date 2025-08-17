@echo off

cd /d "%~dp0"

echo Building AnswerIT Reflector...

REM Check if .NET is installed
dotnet --version >nul 2>&1
if errorlevel 1 (
    echo .NET SDK is required but not detected.
    echo Please download and install .NET SDK from: https://dotnet.microsoft.com/download/dotnet
    pause
    exit /b 1
)

REM Restore packages
echo Restoring NuGet packages...
dotnet restore AnswerITReflector.csproj

REM Build the application
echo Building application...
dotnet build AnswerITReflector.csproj -c Release

REM Publish as single file
echo Publishing as single file...
dotnet publish AnswerITReflector.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true /p:IncludeNativeLibrariesForSelfExtract=true -o ".\bin\publish"
@REM echo Copying files to publish folder...
@REM if not exist "./bin/publish" mkdir "./bin/publish"
@REM copy ".\bin\Release\net48\*" ".\bin\publish\"

echo.
echo Build complete! 
echo Executable location: ./bin/publish/AnswerITReflector.exe
echo.
echo This exe targets .NET Framework 6
echo No additional runtime installation required on target machines
echo.
@REM pause