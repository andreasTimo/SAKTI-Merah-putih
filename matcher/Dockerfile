FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY sigfm_matcher.py test_sigfm_matcher.py ./
RUN python -m unittest -v test_sigfm_matcher.py

EXPOSE 8090
CMD ["python", "sigfm_matcher.py"]
