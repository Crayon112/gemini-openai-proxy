ImageTag := $(shell git rev-parse HEAD)
ID := 041486995294
Region := us-east-2
Profile := default
PodmanProfile := us-east
FUNCTION_NAME := gemini-openai-proxy
REPO_NAME := gemini-openai-proxy

ifeq ($(findstring cn, $(Region)), cn)
	AWS_REPO := $(ID).dkr.ecr.$(Region).amazonaws.com.cn/$(REPO_NAME)
else
	AWS_REPO := $(ID).dkr.ecr.$(Region).amazonaws.com/$(REPO_NAME)
endif
$(info AWS REPO: $(AWS_REPO))


update-submodule:
	git submodule update --init

build: update-submodule
	sudo docker build --platform linux/amd64 -t $(REPO_NAME):$(ImageTag) .
	sudo docker tag $(REPO_NAME):$(ImageTag) $(AWS_REPO):$(ImageTag)

push:
	sudo docker push $(AWS_REPO):$(ImageTag)

clean:
	sudo docker rmi $(REPO_NAME):$(ImageTag)
	sudo docker rmi $(AWS_REPO):$(ImageTag)

deploy-lambda: build push clean
	aws --profile $(Profile) --region $(Region) \
	lambda update-function-code \
	--function-name $(FUNCTION_NAME) \
	--image-uri $(AWS_REPO):$(ImageTag)

podman-build: update-submodule
	podman build --platform linux/amd64 -t $(REPO_NAME):$(ImageTag) .
	podman tag $(REPO_NAME):$(ImageTag) $(AWS_REPO):$(ImageTag)

podman-push:
	podman push $(AWS_REPO):$(ImageTag)

podman-clean:
	podman rmi $(REPO_NAME):$(ImageTag)
	podman rmi $(AWS_REPO):$(ImageTag)

podman-deploy-lambda: podman-build podman-push podman-clean
	aws --profile $(PodmanProfile) --region $(Region) \
	lambda update-function-code \
	--function-name $(FUNCTION_NAME) \
	--image-uri $(AWS_REPO):$(ImageTag)
