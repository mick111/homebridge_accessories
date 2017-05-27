import argparse
import time
import RPi.GPIO as GPIO

GPIO.setmode(GPIO.BOARD)
RED = 40
GREEN = 38
YELLOW = 37
GPIO.setup(RED, GPIO.OUT)
GPIO.setup(GREEN, GPIO.OUT)
GPIO.setup(YELLOW, GPIO.OUT)

i = 0
def joyeuxNoel():
  global i
  while(True):
   i += 1
   GPIO.output(RED,i%3 == 0)
   GPIO.output(GREEN,i%3 == 1)
   GPIO.output(YELLOW,i%3 == 2)
   #print(GPIO.input(RED)),
   #print(GPIO.input(GREEN)),
   #print(GPIO.input(YELLOW))
   time.sleep(0.2)
   if i == 3*5:
      off()
      break

def off(couleurs = None):
   if couleurs is None: couleurs = [RED, GREEN, YELLOW]
   if type(couleurs) == int: couleurs = [couleurs]
   GPIO.output(couleurs, False)

def on(couleurs = None):
   if couleurs is None: couleurs = [RED, GREEN, YELLOW]
   if type(couleurs) == int: couleurs = [couleurs]
   GPIO.output(couleurs, True)


parser = argparse.ArgumentParser(description='LEDs et GPIO.')
parser.add_argument('--couleurs', nargs="+", choices=['rouge', 'vert', 'jaune', 'toutes'])
parser.add_argument('--etat', choices=['on', 'off'])
parser.add_argument("--noel", const = 0, nargs = "?")
if __name__ == "__main__":
    args = parser.parse_args()
    couleurs = []
    if args.couleurs is None or "toutes" in args.couleurs:
	couleurs = None
    else:
       if "rouge" in args.couleurs: couleurs += [RED]
       if "vert"  in args.couleurs: couleurs += [GREEN]
       if "jaune" in args.couleurs: couleurs += [YELLOW]

    etat = False
    if args.etat is None:
       etat = 0
       for couleur in [RED, GREEN, YELLOW]:
          if couleurs is None or couleur in couleurs:
             etat += GPIO.input(couleur)
       etat = etat > 0
    else:
       etat = args.etat == "on"


    if args.noel is not None: joyeuxNoel()
    else:
       if etat: on(couleurs)
       else: off(couleurs)

    GPIO.cleanup()
