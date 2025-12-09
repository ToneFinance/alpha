import requests
from decimal import Decimal, getcontext

# high precision math
getcontext().prec = 50

TOKENS = [
    ("BAT",   "0x02a8db2231f88fee863081aa7baa4b7e3795e84d"),
    ("BDX",   "0xc8805760222bd0a26a9cd0517fecd47f8a0f735f"),
    ("FIL",   "0x4e248e77ccff9766ec3d836a8219d5dd4b646d1d"),
    ("GLM",   "0xec675ef3bd4db1ce1e01990984222636311854d0"),
    ("ICP",   "0xb6eb2a1b73bc0d94 02c59c1b092abcec900b3d04"),
    ("NEAR",  "0x31d0d71d767ce6b4d92af123476f6db87a4f4249"),
    ("NMR",   "0x7ae619fb4025218ba58f0541cc6ebaaefb604769"),
    ("SIREN", "0x4221c19e2bebd58a3bc7b8d38c76bdc72644ff9f"),
    ("TRAC",  "0x812ce10fb1b923c054c47c0cd93244b45850e6a8"),
    ("VANA",  "0x2832bfd3b0141ef7f1452ea1975323153ac0a7c7"),
    ("BCH",   "0xbe1e8ce9c2e3125aa4155e360cab1de1d6109239"),
    ("COMP",  "0x07c0080711b2e937f32846779ee6c5828b8ab24d"),
    ("FRAX",  "0x9babf71cff53a59cbd5aaff768238a60c6ac3f4b"),
    ("KAS",   "0x0fe6ef67eff87378f49864e666039387ff8ade4e"),
    ("LTC",   "0x0c4ceba4def071a21650e54e598a6602157521cc"),
    ("UNI",   "0xf07f3722753db48f1c967d97eefcdd837a247105"),
    ("WLFI",  "0x3eefe62cb64e762b2c207a5e901a16e616a0dc7c"),
    ("XRP",   "0xef28f15fff0df624c7cafe1fcd59a73f366559ca"),
    ("ZEN",   "0xadc745fbaca7d2f6857a19c64f1d0b26094e1033")
]

COINGECKO_IDS = {
    "BAT": "basic-attention-token",
    "BDX": "beldex",
    "FIL": "filecoin",
    "GLM": "golem",
    "ICP": "internet-computer",
    "NEAR": "near",
    "NMR": "numeraire",
    "SIREN": "siren",
    "TRAC": "origintrail",
    "VANA": "vana",
    "BCH": "bitcoin-cash",
    "COMP": "compound",
    "FRAX": "frax",
    "KAS": "kaspa",
    "LTC": "litecoin",
    "UNI": "uniswap",
    "WLFI": "world-liberty-financial",
    "XRP": "ripple",
    "ZEN": "horizen",
}

def fetch_prices(symbols):
    ids = [COINGECKO_IDS[s] for s in symbols if s in COINGECKO_IDS]

    url = "https://api.coingecko.com/api/v3/simple/price"
    url += "?ids=" + ",".join(ids) + "&vs_currencies=usd"

    data = requests.get(url).json()

    prices = {}
    for sym in symbols:
        cg_id = COINGECKO_IDS.get(sym)
        if cg_id and cg_id in data:
            prices[sym] = Decimal(str(data[cg_id]["usd"]))
        else:
            prices[sym] = None
    return prices


# ---- fetch prices ----
symbols = [s for s, _ in TOKENS]
prices = fetch_prices(symbols)

# ---- output TokenConfig() lines ----
for symbol, address in TOKENS:
    p = prices[symbol]

    if p is None:
        scaled = "None"
    else:
        scaled = int(p * Decimal(10**18))

    print(f'tokens.push(TokenConfig("{symbol}", {address}, {scaled}, 18));')
