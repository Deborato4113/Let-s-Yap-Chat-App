# Toxicity service + evaluation

## Run it

    cd ml-service
    python -m venv .venv && .venv\Scripts\activate     # (source .venv/bin/activate on mac/linux)
    pip install -r requirements.txt
    set ML_SERVICE_KEY=dev-secret                       # (export ... on mac/linux)
    uvicorn app:app --port 8001

First start downloads the Detoxify multilingual model (~1 GB). Then in the
Next.js project's `.env.local`:

    ML_SERVICE_URL=http://localhost:8001
    ML_SERVICE_KEY=dev-secret

Restart `npm run dev`. Send a clearly toxic message from one account: the
other account sees it blurred ("This message may be harmful. Show / Not toxic").

## Evaluate it (the part that makes this ML, not just an API call)

Download the Jigsaw Multilingual validation set (Kaggle: "Jigsaw Multilingual
Toxic Comment Classification", file `validation.csv`), then:

    cd eval
    python evaluate.py --csv validation.csv --text-col comment_text --label-col toxic --lang-col lang

It prints ROC-AUC, a precision/recall/F1 threshold sweep, per-language results,
and a keyword-blocklist baseline to beat. Pick `TOXICITY_THRESHOLD` from the
sweep (the script suggests the best-recall threshold with precision >= 0.90).

`eval/sample_eval.csv` is a 16-row toy file that only proves the script runs -
the numbers it gives mean nothing.

Test code-mixed text (Hinglish, e.g. "tu bilkul pagal hai") separately - add
your own labelled rows with `lang=hinglish`; models trained mostly on
English/European languages are weakest there, which is worth reporting.

## Feedback loop

Every "Not toxic" click is stored in the `moderation_feedback` table with the
model's score. Query it to measure the live false-positive rate:

    SELECT verdict, COUNT(*), AVG(score) FROM moderation_feedback GROUP BY verdict;

## Deploying

Build the Dockerfile and host it anywhere that runs containers (Render, Fly,
Hugging Face Spaces). Use a 1-2 GB RAM instance; set `ML_SERVICE_KEY`. Set
`ML_SERVICE_URL` / `ML_SERVICE_KEY` on your Next.js host.
