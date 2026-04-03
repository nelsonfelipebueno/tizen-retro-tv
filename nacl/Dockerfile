FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    wget unzip git build-essential python2 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python2 /usr/bin/python

WORKDIR /src
