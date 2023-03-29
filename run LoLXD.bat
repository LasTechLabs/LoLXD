:: turn off console output
@Echo off

:: run lolxd
node lolxd.js

:: show "exiting in [...]" when lolxd finished
echo This window will close in 5 seconds...

:: exit in 5 seconds
timeout 5 > NUL