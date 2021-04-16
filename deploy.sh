#!/bin/sh
StageName=$1

mkdir -p artifact

sam build
sam package --template-file template.yaml --s3-bucket luckalot-scheduler-artifact --output-template-file artifact/template.${StageName:-"dev"}.out.yaml --profile luckalot.${StageName:-"dev"}
sam deploy --template-file artifact/template.${StageName:-"dev"}.out.yaml --s3-bucket luckalot-scheduler-artifact --stack-name luckalot-scheduler-stack --capabilities CAPABILITY_NAMED_IAM --profile luckalot.${StageName:-"dev"}

rm -rf artifact
