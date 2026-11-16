# Campus research worker

The main scheduled sweep runs within the existing Railway production service.
It checks all enabled schools, uses publisher RSS/Atom and official news pages,
and queues selected recent leads for super-admin review. It never publishes a
post or triggers a push, email or broadcast.

The optional operator runner calls the same protected production API. It uses an
existing `UNIECO_FEED_INGEST_TOKEN` provided through a secret store and does not
accept another host. Do not paste the token into logs or chat.

```powershell
python feed_worker/run_research.py --dry-run
```

A dry run only reads official publishers and returns coverage. Omitting
`--dry-run` writes eligible results to **Campus feed review**. The checked-in
manual GitHub workflow requires installation on the default branch to be
dispatchable through the GitHub UI; production scheduling does not rely on it.

`ingest.py` and `test_ingest.py` are retained for the earlier sample/import
protocol. The local tests exercise that compatibility path, without publication:

```powershell
python -m unittest discover -s feed_worker -p "test_*.py" -v
npm test
```
