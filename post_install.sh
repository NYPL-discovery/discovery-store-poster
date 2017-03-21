#!/bin/bash
printf "\n\n######  Post install script  ###### \n"
sudo cp -r "./libpq" "./node_modules/libpq" \
&& printf "######  DONE!  ###### \n\n"
