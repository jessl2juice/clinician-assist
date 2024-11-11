{pkgs}: {
  deps = [
    pkgs.glibcLocales
    pkgs.iana-etc
    pkgs.ffmpeg-full
    pkgs.rustc
    pkgs.pkg-config
    pkgs.libxcrypt
    pkgs.libiconv
    pkgs.cargo
    pkgs.openssl
    pkgs.postgresql
  ];
}
