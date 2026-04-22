package:
	jsonnet package.jsonnet > package.json

npm-deps:
	npm --prefix . i

grustonnet_schema.json:
	grustonnet-ls --export-config-schema > grustonnet_schema.json

build: package grustonnet_schema.json
	npm run compile
	vsce package -o grustonnet.vsix
