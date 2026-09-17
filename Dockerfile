FROM busybox:1.36.1
COPY dist/extension-trace.js /opt/trace/extension-trace.js
COPY install.sh /usr/local/bin/install-trace
RUN chmod 0444 /opt/trace/extension-trace.js && chmod 0555 /usr/local/bin/install-trace
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/install-trace"]
