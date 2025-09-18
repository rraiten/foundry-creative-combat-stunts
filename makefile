.PHONY: build release

# Usage:
#   make build              # bump (patch), update download, zip, commit, tag, push
#   make build VERSION=0.4.50
#   GITHUB_TOKEN=... make release   # build + create GH Release + upload asset

build:
	@PUBLISH=0 bash ./release.sh $(VERSION)

release:
	@PUBLISH=1 bash ./release.sh $(VERSION)
