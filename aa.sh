#!/bin/bash

string=$'-/\\\n~!hello'

if [[ ! "$string" =~ [[:space:][:cntrl:]] ]]; then
    echo "The string does not contain spaces, newlines, or non-printable characters."
else
    echo "The string contains spaces, newlines, or non-printable characters."
fi

echo "The string is: $string"
