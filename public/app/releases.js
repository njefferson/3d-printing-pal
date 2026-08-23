// GENERATED — do not edit.
//
// Written by tools/changelog.mjs from CHANGELOG.md, which is the one source.
// `npm run notes:check` fails if this file and CHANGELOG.md disagree, or if the
// newest version here does not match public/app/version.js and the service
// worker's cache name.

export const RELEASES = [
  {
    "version": "1.2.0",
    "kind": "CAPABILITY",
    "date": "2026-08-23",
    "summary": "A model lists the jobs that print it, and the buttons say what they open.",
    "added": [
      "A model card now lists its jobs, each with the column it is in, and pressing one opens that job on the board. The card used to say \"3 jobs use this model.\" and leave you to find them."
    ],
    "fixed": [
      "Three buttons on a job card all said some version of \"open\" — one for the job, one for the model, one that was just the name of a website. Now they read Edit, Model, and On Printables with an arrow, so each one says what it opens and the one that leaves the app looks like a link rather than a third button.",
      "\"Open\" on a model card is \"Edit\", for the same reason."
    ],
    "broken": [
      "Two devices still cannot both write. Importing replaces everything, so passing one file back and forth loses whatever the other device added.",
      "A card still does not say how long something has been waiting, what it is worth, or whether there is filament for it."
    ]
  },
  {
    "version": "1.1.0",
    "kind": "CAPABILITY",
    "date": "2026-08-23",
    "summary": "The i button is a short menu now, and your export lives behind it.",
    "added": [
      "Pressing the i gives you five things to choose from instead of one long page to scroll: what this is, what changed, your data, what to do if something is wrong, and the accessibility statement. Each one says what is behind it before you open it, and there is a way back to the list.",
      "Export and Import moved into \"Your data\", next to the safety copies the app keeps and the paragraph explaining why any of it matters. They used to be at the bottom of the screen, which is not where the welcome had been telling you to look for them.",
      "The line at the bottom saying when you last kept a copy is now the way to make one. Press it and it takes you straight to Export."
    ],
    "fixed": [
      "The welcome no longer sends you somewhere the buttons are not. It said to use Export in the information panel; Export was in the footer. Now both are true."
    ],
    "broken": [
      "Two devices still cannot both write. Importing replaces everything, so passing one file back and forth loses whatever the other device added.",
      "Undo still lasts only while the app is open. Closing it or reloading starts again with nothing to take back."
    ]
  },
  {
    "version": "1.0.2",
    "kind": "ITERATION",
    "date": "2026-08-23",
    "summary": "A filter that is on is filled in, not just tinted.",
    "added": [],
    "fixed": [
      "The lit buttons are properly lit now. They are filled with their type's colour, with the label knocked out of it, instead of keeping the same background and changing only the words and the ring around them.",
      "It works if you cannot tell the colours apart. The old version leaned on going from grey to a colour, which is the one difference a colour-blind reader may not get. The new one is a change in <em>brightness</em> — nine to fourteen times, against a floor of three — so it reads in greyscale, in sunlight, and to anybody at all."
    ],
    "broken": [
      "The check that was supposed to catch this asked the wrong question. It confirmed the two states had different backgrounds, which was true, and never asked whether the difference was big enough to see. It measures the actual contrast now, and fails under 3:1."
    ]
  },
  {
    "version": "1.0.1",
    "kind": "ITERATION",
    "date": "2026-08-23",
    "summary": "Every filter button can be switched off, including the last one.",
    "added": [],
    "fixed": [
      "The board no longer insists you keep one type showing. Turning the last filter off was refused, so clearing them all and then picking the single thing you wanted to look at did not work — you had to do it the other way round, and work out which button the app would not let go of.",
      "It was guarding a confusion this app does not have. The board already tells you which kind of empty it is: <em>No jobs yet</em> when there are none, and <em>Every job is hidden by the filters above</em> when there are. The second message has been there the whole time.",
      "Turning them all off now survives a reload. It used to be quietly undone the next time you opened the app, which is worse than refusing it outright — a setting that reverts on its own is one you cannot trust."
    ],
    "broken": []
  },
  {
    "version": "1.0.0",
    "kind": "VERSION",
    "date": "2026-08-23",
    "summary": "The first release meant for somebody other than its author.",
    "added": [
      "A welcome written for a stranger. The first thing a new reader sees now says what this is, that their data lives in this browser and nowhere else, what it will not do, how to put it on a home screen, and the two facts about it that are not guessable from any other app. It is the same text that lives under the <b>i</b> button afterwards — one copy, so there is nothing to keep in step.",
      "It is on the hub. print-tracker is listed with the other free apps rather than being a link somebody had to be given."
    ],
    "fixed": [
      "The welcome knows there are four job types. It still described three, and said the filters hide \"any of the three\", from the release that added Ordered until this one. The app's own explanation of itself was wrong for a day.",
      "Nothing will let that happen quietly again. The build now fails if the welcome does not name every job type the app offers, or if it counts them wrong."
    ],
    "broken": [
      "There is no manual, and there is not going to be one. Anything the app cannot explain where you are standing is a defect in that screen. If something sends you looking for documentation, that is worth reporting as a bug."
    ]
  },
  {
    "version": "0.8.1",
    "kind": "ITERATION",
    "date": "2026-08-23",
    "summary": "The filter buttons light up instead of carrying a tick.",
    "added": [],
    "fixed": [
      "A filter that is on is lit, in its own type's colour. The chips used to show a small tick, which asked you to read a mark rather than see a state — and put the answer in a glyph about the width of your own fingertip's shadow. A chip that is showing its type now has a filled background and a coloured ring, the same colour that type's badge carries on the card, so the two teach each other.",
      "The state is not carried by colour alone. On and off differ in fill as well, so it still reads in greyscale, to a colour-blind reader, and on a phone in sunlight. That was the one real risk in dropping the tick.",
      "Nothing moves when you press one. Both states keep the same border and the same weight, so the chips after the one you pressed stay where your finger expects them."
    ],
    "broken": []
  },
  {
    "version": "0.8.0",
    "kind": "CAPABILITY",
    "date": "2026-08-23",
    "summary": "Ordered is a fourth job type, and it is the one money belongs to.",
    "added": [
      "Ordered, beside Asked, Gift and Fun. It is for a print somebody is paying for: it asks who it is for and what you charged, and the card shows both. The other three no longer ask about money at all, because they never had any.",
      "Price only appears where there is a price. It used to sit on every job, which meant three categories out of four carried a box that is never filled in. A form of boxes that do not apply is how you learn to skip past the ones that do."
    ],
    "fixed": [
      "The printer is no longer asked for on a job that is still Research. Nothing is on a machine yet, so there is nothing to answer. The box appears once the job moves to Staged or beyond.",
      "The printers you already use are offered as a list. Two machines of the same make are told apart by whatever you called them, not by the make — so the second time is a choice rather than typing the same name again. The list is read from the jobs on the board; there is no separate list of printers to keep up to date.",
      "A new job type cannot be hidden by a filter that predates it. The type filter remembers which chips are on, and a saved answer from before Ordered existed would have filed every Ordered job out of sight on the release that introduced them. It now knows the difference between a chip you turned off and one that did not exist yet."
    ],
    "broken": [
      "Nothing was migrated. A job that was Asked and had a price on it is still Asked, and its price is no longer shown. Open it and choose Ordered to bring the money back — the app will not reclassify your jobs by guessing.",
      "Changing a job away from Ordered clears its price, the same way changing it away from Asked or Gift clears who it is for. Undo puts it straight back."
    ]
  },
  {
    "version": "0.7.2",
    "kind": "ITERATION",
    "date": "2026-08-23",
    "summary": "Undo is a button in the top bar now, and the strip across the page is gone.",
    "added": [],
    "fixed": [
      "Undo moved into the app's own bar, beside the (i). It was a band across the page describing what you had just done, which is not how undo works anywhere else — nothing else on your device narrates your own edits back to you in a strip. It is now a button where you would expect to find one, and it is there from the moment the app opens rather than appearing after your first change.",
      "It says what it will put back when you touch and hold it, and it says what came back after you press it. The words used to sit permanently on screen; they are on the button itself now.",
      "The ✕ that hid the strip is gone, and nothing is given up any more. Hiding it used to cost you that one undo. There is nothing to hide, so there is nothing to lose.",
      "The page is one band shorter. On a phone the strip took about 7% of the screen whenever anything had been changed, which was most of the time."
    ],
    "broken": []
  },
  {
    "version": "0.7.1",
    "kind": "ITERATION",
    "date": "2026-08-23",
    "summary": "The three job types say what they are for, and the middle one is a gift.",
    "added": [
      "Wanted is now Gift, and it carries a name. It always meant something and the app never asked what: a print for somebody else who did not ask for it. So it now asks who it is for, exactly as Asked does, and the card says so. Choosing it used to change nothing at all."
    ],
    "fixed": [
      "Asked, Gift and Fun make sense now. They sat under a heading that said only \"Type\", which is not a question, so they read as three categories with rules to work out. The heading is now the question they answer — why is it on the board — and each one says what choosing it does. Nothing about your existing jobs changed; anything that was Wanted is now Gift and can be given a name whenever you open it.",
      "Request is called Asked, which is the word people use for it.",
      "\"Who asked for it\" is now \"Who it is for\", because a gift has somebody it is for and nobody asked."
    ],
    "broken": []
  },
  {
    "version": "0.7.0",
    "kind": "CAPABILITY",
    "date": "2026-08-23",
    "summary": "A picture can be added where the job is made, a model can start its own job, and the undo strip has stopped shouting.",
    "added": [
      "Add the picture on the job. A job could make its model and keep its link, but not give it the photograph — so the one thing that makes a card readable was the one thing that still meant going to Models and editing. The Picture box is now on the job form, and it says which record will keep it: the model the job is about to make, the model it links to, or the job itself when that model already has a picture of its own. A model's picture is never replaced from here.",
      "Start a job from a model. Every model in the catalog has a button that opens a new job already about it, with the name filled in. Deciding what to print happens in the catalog, so that is where printing it now starts.",
      "One paste catalogues a model. The Add model screen has a Link box at the top, the same one the job form has had since 0.5.0. Paste an address and the name fills in and the address is filed below it. Cataloguing something used to mean Add model, then Add a source, then typing a name the address already contained — or adding a job you did not want, because that screen could do it in one."
    ],
    "fixed": [
      "Naming a model fills the title. Pasting a link filled the title and the title filled the Model box, so a whole request arrived from one paste — but typing or choosing a model that already exists filled nothing, and the same words had to be typed a second time. The two boxes now fill each other, and choosing \"benchy\" from the list puts \"Benchy\" in the title, spelled the way the model is.",
      "The undo strip is quiet, and it can be hidden. It was built as a copy of the update strip — raised background, two heavy rules — which is right for a message about the app and wrong for one describing what you just did on purpose. It was 9% of a phone screen tall, permanently, on every screen. It now sits on the page in small type and takes 7%, and the ✕ hides it until the next change. Hiding it gives up the undo for that one change, and it says so.",
      "A picture's address no longer names a model after a hash. Pasting the link to an image rather than to its page offered \"3ad2d89093fc967b\" as the name, and then \"Design\", and then \"Makerworld\", as each was rejected. Those addresses are all route and hash and contain no name, so the box now stays empty, which is the truth about them. A single-word name like \"Dragon\" still fills in.",
      "A job with no picture has something to look at. A card carrying a photograph is more than twice the height of one without, and beside it the plain card stopped registering as an item at all. Cards without a picture now carry a small square with the job's initial in it — an anchor for the eye, not the picture-sized gap that was removed in 0.5.1."
    ],
    "broken": []
  },
  {
    "version": "0.6.0",
    "kind": "CAPABILITY",
    "date": "2026-08-22",
    "summary": "The model a job prints is named on its card and opens from there, and choosing a job's type is one tap instead of a dropdown.",
    "added": [
      "Every card says which model it prints, and pressing that opens the model — no going to the Models tab and hunting for it. When the model has the same name as the job, which is the ordinary case, the button just says \"Open the model\" rather than repeating the title back at you.",
      "Type is three buttons — Request, Wanted, Fun — instead of a dropdown. All three are readable without opening anything, and picking one is a single tap rather than a tap, a picker wheel and a tap."
    ],
    "fixed": [
      "Web address and type controls were being drawn as full-width text boxes, because the rule that sizes boxes you type into did not know that a radio button draws itself. The type buttons looked broken for exactly one release before shipping."
    ],
    "broken": [
      "A card does not say how long a job has been waiting, what it is worth, or whether there is filament for it. Choosing what to print next is still a judgement made from a name and a picture.",
      "Only the name and the site can be read from an address. The picture and the description cannot, and getting them would need a server this app does not have.",
      "Two devices cannot both make changes. Restoring a backup replaces everything, so passing one file between a computer and a phone loses whatever the other one added. One device has to be the only one that writes.",
      "The Link box on a job is for adding an address, and it starts empty when you reopen a job. The addresses a model has are listed under it in Models.",
      "Undo lasts for as long as the app is open. Closing it, or reloading the page, starts again with nothing to undo.",
      "Restoring a backup cannot be undone. The way back is the safety copy the app downloads immediately before it does so.",
      "Changing a filter, the currency or the sort order is not a change undo tracks.",
      "A picture has to be added by hand.",
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.5.1",
    "kind": "ITERATION",
    "date": "2026-08-22",
    "summary": "More jobs fit on a screen, because a job with no picture no longer leaves a picture-sized gap.",
    "added": [],
    "fixed": [
      "A card with no picture was drawing an empty panel where one would go — 128 pixels of a 291-pixel card, nearly half of it, on every job that had not been given a photograph. Four such jobs filled a phone screen and a half. The space is now taken only where there is a picture in it.",
      "The panel is still held open while a picture is loading, which is what it was for: a board with photographs does not jump about as they arrive. What changed is that a job with no picture at all stopped paying that cost forever.",
      "Model rows in the catalog still show the panel, because there the picture sits beside the name and its absence would leave the list ragged."
    ],
    "broken": [
      "A card does not say how long a job has been waiting, what it is worth, or whether there is filament for it. Choosing what to print next is still a judgement made from a name and a picture.",
      "Only the name and the site can be read from an address. The picture and the description cannot, and getting them would need a server this app does not have.",
      "The Link box on a job is for adding an address, and it starts empty when you reopen a job. The addresses a model has are listed under it in Models.",
      "Undo lasts for as long as the app is open. Closing it, or reloading the page, starts again with nothing to undo.",
      "Restoring a backup cannot be undone. It replaces everything on purpose, and the way back is the safety copy the app downloads immediately before it does so.",
      "Changing a filter, the currency or the sort order is not a change undo tracks.",
      "A picture has to be added by hand.",
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.5.0",
    "kind": "CAPABILITY",
    "date": "2026-08-22",
    "summary": "A request usually arrives as a link and nothing else. The link is now the first thing the app asks for, and the last thing you need to type.",
    "added": [
      "Link is the first box on a job. Paste the address somebody sent and the name fills itself in from it, the model fills in from the name, and the address is kept with the model when the job is saved. For an ordinary request that leaves who asked for it, and nothing else.",
      "The address is kept on the model rather than the job, because the model is the thing that exists on somebody's site. Print it again next month for somebody else and it is the same address, already there.",
      "Job cards now carry a button to where the file came from — the site's name, opening in a new tab. Choosing what to print next no longer means reading the board, leaving it for the Models tab, and coming back.",
      "A second job for the same thing does not file the same address twice."
    ],
    "fixed": [
      "The name taken from an address was often the wrong word. A Printables link copied from the Files tab — the one you send to somebody who is going to print the thing — offered the name \"Files\". It now reads the part of the address that is the name, and keeps a year inside a name instead of dropping it as if it were an id number.",
      "Links under a model in the Models tab were too small to press reliably. They are now full-height targets like every other control.",
      "Web address boxes were a third of the height of every other box, which made them hard to hit and out of step with the rest of the form."
    ],
    "broken": [
      "Only the name and the site can be read from an address. The picture and the description cannot: a browser is not allowed to read another site's pages, so those need a server this app does not have and will not get without that being a deliberate trade.",
      "The Link box on a job is for adding an address, and it starts empty when you reopen a job. The addresses a model has are listed under it in Models, which is where they are changed.",
      "A job with no model has nowhere to keep a link, because a link is kept on the model. Turning off Save this as a model with a link pasted says so before you save.",
      "Undo lasts for as long as the app is open. Closing it, or reloading the page, starts again with nothing to undo — something deleted yesterday comes back from a backup, not from here.",
      "Restoring a backup cannot be undone. It replaces everything on purpose, and the way back is the safety copy the app downloads immediately before it does so.",
      "Changing a filter, the currency or the sort order is not a change undo tracks. It covers jobs, spools and models — the things a wrong press loses.",
      "A picture has to be added by hand.",
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.4.1",
    "kind": "ITERATION",
    "date": "2026-08-22",
    "summary": "Saving a job no longer decides on your behalf whether the name in the Model box becomes a model.",
    "added": [],
    "fixed": [
      "A tick box under the Model box, on by default, for a name that is not in your models yet. Turn it off and the job is saved with no model and nothing is added to the catalog — for a one-off that is not worth keeping, or a job that is not a print of anything. Clearing the box still works too; this is the way that does not mean deleting text you just watched appear.",
      "The tick is only there when there is something to decide. A name already in your models is linked either way, and an empty box means no model, so the question is asked in the one case where it has an answer.",
      "The line under the box says which of the three things saving will do, and changes as soon as the tick does."
    ],
    "broken": [
      "The tick starts on again every time a job form is opened. It is a decision about that job rather than a setting, so a job you meant to keep out of the catalog needs it turned off each time.",
      "A name you decline is not kept anywhere. The job's own title still says what was printed, but there is no second place recording a model name without a model.",
      "The Model box never renames anything. Editing it points the job at a different model, or makes one; a model is renamed in Models, where the rest of its details are. That is on purpose, because a box on a job that could rename a model would quietly rewrite it everywhere.",
      "A model added this way has only a name. Designer, tags, links and listings are filled in on the model itself when there is something to put there.",
      "Undo lasts for as long as the app is open. Closing it, or reloading the page, starts again with nothing to undo — something deleted yesterday comes back from a backup, not from here.",
      "Restoring a backup cannot be undone. It replaces everything on purpose, and the way back is the safety copy the app downloads immediately before it does so.",
      "Changing a filter, the currency or the sort order is not a change undo tracks. It covers jobs, spools and models — the things a wrong press loses.",
      "A picture has to be added by hand. Dropping in an address cannot pull the photo from the page, because a browser is not allowed to read another site's pages.",
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.4.0",
    "kind": "CAPABILITY",
    "date": "2026-08-22",
    "summary": "A model no longer has to exist before a job can name it. Adding the job adds the model.",
    "added": [
      "The Model box on a job is a name you type rather than a list you pick from. If the name is not in your models yet, saving the job adds it — no leaving the form, adding a model, and coming back.",
      "The box fills itself in from the job's title, so a job named after the thing being printed needs no typing at all. Type over it or clear it whenever the two are not the same.",
      "Under the box it says which of the two things saving will do — \"Links to Benchy, already in your models\" or \"Benchy will be added to your models\" — before you save rather than after. A name that differs only in capitals or spacing counts as the same model, so a stray space does not make a second one.",
      "Undo takes back both together. A job that added a model, undone, leaves neither.",
      "The names you already have are offered as suggestions as you type."
    ],
    "fixed": [
      "A job could only be attached to a model that had already been entered, which made adding a model a prerequisite for recording work rather than something to do when there was a reason to."
    ],
    "broken": [
      "The Model box never renames anything. Editing it points the job at a different model, or makes one; a model is renamed in Models, where the rest of its details are. That is on purpose, because a box on a job that could rename a model would quietly rewrite it everywhere.",
      "A model added this way has only a name. Designer, tags, links and listings are filled in on the model itself when there is something to put there.",
      "Undo lasts for as long as the app is open. Closing it, or reloading the page, starts again with nothing to undo — something deleted yesterday comes back from a backup, not from here.",
      "Restoring a backup cannot be undone. It replaces everything on purpose, and the way back is the safety copy the app downloads immediately before it does so.",
      "Changing a filter, the currency or the sort order is not a change undo tracks. It covers jobs, spools and models — the things a wrong press loses.",
      "A picture has to be added by hand. Dropping in an address cannot pull the photo from the page, because a browser is not allowed to read another site's pages.",
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.3.0",
    "kind": "CAPABILITY",
    "date": "2026-08-22",
    "summary": "There is a way back. Every change to a job, a spool or a model can be undone, and a card's position in its column can now be set without dragging it.",
    "added": [
      "An undo strip under the tabs, which says what it would put back — \"Last change: deleting Benchy\" — rather than offering a bare Undo and leaving you to remember which of the last few things you did was the last one. It appears with the first change and stays there; it is not a message that vanishes while you are reading it.",
      "One press undoes the whole change, including everything it took with it. Deleting a spool that four jobs drew on unlinks it from all four, and undoing that brings back the spool and all four links together.",
      "The last twenty changes are kept, so a run of wrong presses can be walked back one at a time.",
      "The Move panel now sets a card's place inside its column as well as which column it is in — \"Put before Calibration cube\", \"Put last in Printing\". Each position is named and takes one press, so the card lands where the button said it would even though the panel is covering the board."
    ],
    "fixed": [
      "Reordering cards within a column was possible by dragging and by nothing else, which made it unusable with a keyboard, with a screen reader, or by anyone who cannot hold a drag steady. The Move panel now does everything the drag does.",
      "Adding a picture to a model wrote the picture before it wrote the model. Undoing such a change would have left the picture in the app with nothing pointing at it, taking up room in every backup from then on."
    ],
    "broken": [
      "Undo lasts for as long as the app is open. Closing it, or reloading the page, starts again with nothing to undo — something deleted yesterday comes back from a backup, not from here.",
      "Restoring a backup cannot be undone. It replaces everything on purpose, and the way back is the safety copy the app downloads immediately before it does so.",
      "Changing a filter, the currency or the sort order is not a change undo tracks. It covers jobs, spools and models — the things a wrong press loses.",
      "A picture has to be added by hand. Dropping in an address cannot pull the photo from the page, because a browser is not allowed to read another site's pages.",
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.2.0",
    "kind": "CAPABILITY",
    "date": "2026-08-09",
    "summary": "Models and jobs can carry a picture, so the board can be read by sight instead of by name.",
    "added": [
      "A picture on a model, and on the cards for the jobs that print it. Add one by choosing a file, by pasting, or by dropping it in. On a phone or tablet the picker also offers the camera, so a finished print can be photographed.",
      "Pictures are shrunk to a thumbnail on your own device before they are kept. Nothing is uploaded, nothing is fetched, and a picture works offline like the rest of the app because it lives on the device rather than on somebody's site.",
      "Pasting an address into a model fills in the site it came from, and offers a name taken from the address itself. It only ever fills a box you have left empty, and everything it suggests can be typed over.",
      "Backups now carry your pictures, and restoring one brings them back exactly as they were."
    ],
    "fixed": [],
    "broken": [
      "A picture has to be added by hand. Dropping in an address cannot pull the photo from the page, because a browser is not allowed to read another site's pages.",
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "There is no undo yet. Deletions ask first and say what they will unlink, but once a thing is gone the way back is an export taken beforehand.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.1.2",
    "kind": "ITERATION",
    "date": "2026-08-08",
    "summary": "The app has a new icon, and the link preview card has new artwork.",
    "added": [],
    "fixed": [
      "A new icon: a print nozzle laying down layers. The old one was a filament spool seen face-on, and at a glance it read as an eye rather than a spool.",
      "The link preview card now shows a row of printers instead of the spool, so sending someone the address shows something that looks like what the app is for."
    ],
    "broken": [
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "There is no undo yet. Deletions ask first and say what they will unlink, but once a thing is gone the way back is an export taken beforehand.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.1.1",
    "kind": "ITERATION",
    "date": "2026-08-08",
    "summary": "Sharing a link to the app now shows a proper card instead of a bare address.",
    "added": [
      "A link preview card, so sending someone the address shows the app's name and what it does rather than just a domain. The same card is what shows on the repository page."
    ],
    "fixed": [],
    "broken": [
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "There is no undo yet. Deletions ask first and say what they will unlink, but once a thing is gone the way back is an export taken beforehand.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  },
  {
    "version": "0.1.0",
    "kind": "CAPABILITY",
    "date": "2026-08-07",
    "summary": "The first release.",
    "added": [
      "Track print jobs on a board with six columns: research, staged, printing, complete, delivered and archived. Move a card by dragging its handle, or with the Move button on the card — whichever suits the moment and the device.",
      "Filter the board by job type, so a board full of your own projects can show only the ones somebody is waiting on.",
      "Keep a filament inventory. Remaining weight is worked out from the grams logged against your jobs rather than stored, so it cannot quietly drift away from what is actually on the spool.",
      "Keep a model catalog with where a file came from, where it is listed, and what you have charged across everything delivered from it.",
      "Export everything to one file, and import it back. Import replaces what is there, asks first, and saves a copy of your current data before it starts.",
      "Works offline once it has loaded, and installs to a home screen."
    ],
    "fixed": [],
    "broken": [
      "Filament counts as used the moment it is logged against a job, whichever column that job is sitting in. That is the honest answer to how much is left on a spool, but it means a job parked in research with grams already logged has spent that filament as far as the inventory is concerned.",
      "There is no undo yet. Deletions ask first and say what they will unlink, but once a thing is gone the way back is an export taken beforehand.",
      "Costs and prices are plain numbers with a currency symbol you choose. There is no per-currency formatting and no conversion.",
      "An installed app on iPadOS will not always let a waiting update take over while the app is open. If the version at the bottom of the screen is not the one you expect, close the app fully and open it again."
    ]
  }
];
