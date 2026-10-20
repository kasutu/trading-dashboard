# Admin commands inside the api container (Railway: railway ssh --service api).
# Examples: make users | make owner NAME=kasutu | make plan NAME=alice PLAN=espresso

.PHONY: help users plan owner
help:
	@api help

users:
	@api users

plan:
	@test -n "$(NAME)" -a -n "$(PLAN)" || { echo "Usage: make plan NAME=<username> PLAN=<free|espresso|latte|owner>"; exit 1; }
	@api plan "$(NAME)" "$(PLAN)"

owner:
	@test -n "$(NAME)" || { echo "Usage: make owner NAME=<username>"; exit 1; }
	@api owner "$(NAME)"
