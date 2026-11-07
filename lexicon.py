"""Small built-in word lists for 'Feeling of a comment' (English, Hindi in Devanagari, and common Hindi written in English letters).
Plain lists, no model: a comment's score is the sum of its words (+1 / -1, strong words +2 / -2), turned round by a nearby "not".
They are a rough guide: sarcasm, mixed comments and words used in a special sense are not understood."""

POS = """good great excellent amazing awesome wonderful fantastic perfect best better love loved lovely like liked happy glad pleased satisfied
nice fine superb brilliant outstanding helpful friendly quick fast prompt polite smooth easy comfortable clean beautiful pleasant enjoyed enjoy
recommend recommended thanks thank thankful grateful delighted impressive impressed reliable efficient supportive cooperative kind resolved solved
improved improvement success successful worth valuable useful positive proud cheerful fresh tasty delicious responsive
अच्छा अच्छी अच्छे बढ़िया बेहतर बेहतरीन उत्तम शानदार सुंदर खुश संतुष्ट धन्यवाद शुक्रिया आभार प्रशंसा सराहनीय तेज़ तेज सहयोगी मददगार सरल आसान स्वच्छ साफ सही सफल सुधार
accha acha achha achi badhiya behtar behtareen shandar sundar khush santusht dhanyawad shukriya sahi saaf""".split()
POS_STRONG = """excellent amazing awesome wonderful fantastic perfect best superb brilliant outstanding love loved delighted
बेहतरीन शानदार उत्तम behtareen shandar""".split()

NEG = """bad worse worst poor terrible awful horrible hate hated disappointed disappointing unhappy angry annoyed annoying slow late delay delayed delays
rude dirty broken problem problems issue issues complaint complaints complain fail failed failure wrong error errors useless waste difficult hard
pending ignored ignore refused refuse unacceptable harassment harassed corrupt corruption bribe fraud cheat cheated unhelpful careless negligent
irregular shortage pathetic worthless frustrating frustrated confusing confused sad upset damaged defective stale cold missing lost
बुरा बुरी बुरे खराब ख़राब गलत ग़लत देरी विलंब धीमा धीमी परेशानी परेशान समस्या शिकायत असंतुष्ट नाराज़ नाराज गंदा गंदी भ्रष्टाचार रिश्वत धोखा लापरवाही बेकार बदतर अनुपस्थित कमी टूटा
bura buri kharab galat deri dhima pareshani pareshan samasya shikayat naraz ganda bekar laparwahi rishwat bhrashtachar""".split()
NEG_STRONG = """worst terrible awful horrible hate hated unacceptable corrupt corruption bribe fraud cheat cheated pathetic worthless
भ्रष्टाचार रिश्वत धोखा बदतर bhrashtachar rishwat""".split()

# turn the meaning round when one of these is just before the word (one or two words earlier) ...
NEGATORS = """not no never cannot cant dont doesnt didnt isnt wasnt wont wouldnt couldnt shouldnt without hardly nor neither
don't doesn't didn't isn't wasn't won't wouldn't couldn't shouldn't can't
बिना कभी नहीं नही""".split()
# ... or just after it (Hindi puts it after: "अच्छा नहीं है")
POST_NEGATORS = "नहीं नही नहिं nahi nahin nahee".split()


def table(extra_pos=(), extra_neg=()):
    """{word: score}. A word the user adds wins over the built-in lists."""
    t = {}
    for w in POS:
        t[w] = 2 if w in POS_STRONG else 1
    for w in NEG:
        t[w] = -2 if w in NEG_STRONG else -1
    for w in extra_pos:
        w = str(w).strip().lower()
        if w:
            t[w] = 1
    for w in extra_neg:
        w = str(w).strip().lower()
        if w:
            t[w] = -1
    return t
