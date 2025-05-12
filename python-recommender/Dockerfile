FROM python:3.10-slim

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y build-essential

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "recommender.py"]
