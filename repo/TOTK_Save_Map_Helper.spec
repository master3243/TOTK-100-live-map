# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\server.py'],
    pathex=[],
    binaries=[],
    datas=[('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\index.html', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\styles.css', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\app.js', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\korok_data.json', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\completion_data.json', '.'), ('M:\\MyFiles\\Code\\Python\\Scripts\\zelda_korok_helper\\repo\\config.json', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
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
)
