FIREFOX_XPI := dist/word-hover-ipa-firefox.xpi
CHROME_ZIP  := dist/word-hover-ipa-chrome.zip

FIREFOX_SRC := $(wildcard firefox/*)
CHROME_SRC  := $(wildcard chrome/*)

.PHONY: all firefox chrome clean

all: firefox chrome

firefox: $(FIREFOX_XPI)

chrome: $(CHROME_ZIP)

$(FIREFOX_XPI): $(FIREFOX_SRC) | dist
	cd firefox && zip -r $(CURDIR)/$@ .

$(CHROME_ZIP): $(CHROME_SRC) | dist
	cd chrome && zip -r $(CURDIR)/$@ .

dist:
	mkdir -p dist

clean:
	rm -rf dist
