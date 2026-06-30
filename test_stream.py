import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app.llm import parse_nl_rule_stream

for x in parse_nl_rule_stream("10% off cart > 100"):
    print(x)
