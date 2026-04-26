# -*- mode: python ; coding: utf-8 -*-


block_cipher = None


a = Analysis(
    ['M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\gui.py'],
    pathex=[],
    binaries=[],
    datas=[('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\index.html', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\styles.css', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\app.js', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\korok_data.json', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\completion_data.json', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\assets', 'assets'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\config.json', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\.pyinstaller-build\\\\app.ico', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
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
    name='TOTK_Save_Map_Helper',
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
    icon=['M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\.pyinstaller-build\\app.ico'],
)
