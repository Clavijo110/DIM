import sys
import urllib3
import requests.adapters

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
_send = requests.adapters.HTTPAdapter.send


def _patched_send(self, request, **kwargs):
    # Solo hosts de descarga de GitHub; PlatformIO valida el SHA-256 del registro.
    if "githubusercontent.com" in request.url or "://github.com" in request.url:
        kwargs["verify"] = False
    return _send(self, request, **kwargs)


requests.adapters.HTTPAdapter.send = _patched_send

from platformio.__main__ import main  # noqa: E402

sys.exit(main())
