#!/usr/bin/env python3
"""
Build script for PalmSpeak Control Centre
Creates an executable file with all dependencies included
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# Configure console for Unicode output
def configure_unicode_console():
    # Use the global sys module
    global sys
    
    if sys.stdout.encoding is None or sys.stdout.encoding.lower() == 'utf-8':
        return
    
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

configure_unicode_console()

def check_requirements():
    """Check if all required packages are installed"""
    # Map pip package names to import names
    package_imports = {
        'pyinstaller': 'PyInstaller',
        'flask': 'flask',
        'flask-cors': 'flask_cors',
        'tensorflow': 'tensorflow',
        'numpy': 'numpy',
        'opencv-python': 'cv2',
        'mediapipe': 'mediapipe',
        'pillow': 'PIL'
    }
    
    missing_packages = []
    
    for pip_name, import_name in package_imports.items():
        try:
            __import__(import_name)
            print(f"[OK] {pip_name}")
        except ImportError:
            missing_packages.append(pip_name)
            print(f"[MISSING] {pip_name}")
    
    if missing_packages:
        print(f"\nMissing packages: {', '.join(missing_packages)}")
        print("Please install them using: pip install " + ' '.join(missing_packages))
        return False
    
    print("All packages found!")
    return True

def create_spec_file():
    """Create PyInstaller spec file for advanced configuration"""
    # Get current directory for the spec file
    current_dir = os.path.abspath('.')
    spec_content = f'''
# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs

block_cipher = None

# Define paths - use absolute paths
script_dir = Path(r"{current_dir}")
main_script = script_dir / "palmspeak_control_centre.py"
model_dir = script_dir / "alphabet_keras"
images_dir = script_dir / "images"

# Data files to include
datas = []

# Add model files if they exist
if model_dir.exists():
    datas.append((str(model_dir), "alphabet_keras"))

# Add image files if they exist
if images_dir.exists():
    datas.append((str(images_dir), "images"))

# MediaPipe assets
datas += collect_data_files("mediapipe")

# TensorFlow binaries
binaries = collect_dynamic_libs("tensorflow") + collect_dynamic_libs("tensorflow.python")

# Hidden imports for packages that PyInstaller might miss
hiddenimports = [
    'flask',
    'flask_cors',
    'tensorflow',
    'tensorflow.keras',
    'tensorflow.keras.models',
    'tensorflow.keras.layers',
    'tensorflow.python.keras.api._v2.keras',
    'numpy',
    'cv2',
    'mediapipe',
    'mediapipe.python.solutions.hands',
    'PIL',
    'PIL.Image',
    'queue',
    'threading',
    'logging',
    'socket',
    'contextlib',
    'collections',
    'base64',
    'io',
    'traceback',
    'tkinter',
    'tkinter.ttk',
    'tkinter.scrolledtext',
    'tkinter.messagebox'
]

a = Analysis(
    [str(main_script)],
    pathex=[str(script_dir)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={{}},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='PalmSpeak_Control_Centre',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(images_dir / "icon128.png") if (images_dir / "icon128.png").exists() else None,
)
'''
    
    with open('palmspeak.spec', 'w', encoding='utf-8') as f:
        f.write(spec_content.strip())
    
    print("Created palmspeak.spec file")

def build_executable():
    """Build the executable using PyInstaller"""
    try:
        # Create the spec file first
        create_spec_file()
        
        # Build command
        cmd = [
            sys.executable, '-m', 'PyInstaller',
            '--clean',
            '--noconfirm',
            'palmspeak.spec'
        ]
        
        print("Building executable...")
        print("Command:", ' '.join(cmd))
        
        # Run PyInstaller with UTF-8 encoding
        env = os.environ.copy()
        env['PYTHONUTF8'] = '1'
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env)
        
        if result.returncode == 0:
            print("Build successful!")
            print(f"Executable created in: {os.path.abspath('dist')}")
            return True
        else:
            print("Build failed!")
            print("STDOUT:", result.stdout)
            print("STDERR:", result.stderr)
            return False
            
    except Exception as e:
        print(f"Build error: {str(e)}")
        return False

def create_requirements_txt():
    """Create requirements.txt with exact versions"""
    requirements = """Flask==2.3.3
flask-cors==4.0.0
tensorflow==2.12.0
numpy==1.23.5
opencv-python==4.8.1.78
mediapipe==0.10.11
Pillow==10.0.1
PyInstaller==5.13.2
"""
    
    with open('requirements.txt', 'w', encoding='utf-8') as f:
        f.write(requirements.strip())
    
    print("Created requirements.txt")

def cleanup():
    """Clean up build artifacts"""
    cleanup_dirs = ['build', '__pycache__']
    cleanup_files = ['palmspeak.spec']
    
    for dir_name in cleanup_dirs:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)
            print(f"Cleaned up {dir_name}/")
    
    for file_name in cleanup_files:
        if os.path.exists(file_name):
            os.remove(file_name)
            print(f"Cleaned up {file_name}")

def main():
    """Main build process"""
    print("PalmSpeak Control Centre - EXE Builder")
    print("=" * 50)
    
    # Check if we're in the right directory
    if not os.path.exists('palmspeak_control_centre.py'):
        print("Error: palmspeak_control_centre.py not found in current directory")
        print("Please run this script from the same directory as your main script")
        return
    
    # Create requirements.txt
    create_requirements_txt()
    
    # Check requirements
    print("Checking requirements...")
    if not check_requirements():
        return
    
    print("All requirements satisfied")
    
    # Build executable
    success = build_executable()
    
    if success:
        print("\n" + "=" * 50)
        print("BUILD COMPLETED SUCCESSFULLY!")
        print("=" * 50)
        print(f"Executable location: {os.path.abspath('dist/PalmSpeak_Control_Centre.exe')}")
        print("\nNext steps:")
        print("1. Test the executable in the dist/ folder")
        print("2. Make sure your model file (alphabet_keras/asl_alphabet_model.h5) is included")
        print("3. Distribute the entire dist/ folder (not just the .exe)")
        
        # Check if model exists
        model_path = "alphabet_keras/asl_alphabet_model.h5"
        if os.path.exists(model_path):
            print(f"Model file found: {model_path}")
        else:
            print(f"Model file not found: {model_path}")
            print("Make sure to place your trained model in the alphabet_keras/ folder")
    else:
        print("\nBuild failed. Check the error messages above.")
    
    # Ask about cleanup
    cleanup_choice = input("\nClean up build artifacts? (y/n): ").lower().strip()
    if cleanup_choice == 'y':
        cleanup()

if __name__ == "__main__":
    main()