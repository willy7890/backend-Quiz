import os


try:
    COMPUTER_REWARD_POINTS = int(os.getenv("COMPUTER_REWARD_POINTS", "20"))
except ValueError as exc:
    raise RuntimeError("COMPUTER_REWARD_POINTS must be a positive integer") from exc

if COMPUTER_REWARD_POINTS <= 0:
    raise RuntimeError("COMPUTER_REWARD_POINTS must be a positive integer")
