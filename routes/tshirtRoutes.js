const express = require("express");

const router = express.Router();

router.get('/:id', (req, res)=> 
    {
        res.status(200).send(
        {
            tshirt: '👚',
            size: 'large',
            size: req.params.id
        })
    });

router.get('/', (req, res)=> 
    {
        res.status(200).send({
            tshirt: '👚',
            size: 'large'
        })
    });


router.post('/:id', (req, res) => 
{
    const { id } = req.params;
    const { logo } = req.body;

    if(!logo)
    {
        res.status(418).send({ message: 'We need a logo!'})
    }

    res.send(
    {
        tshirt: `👚 with your ${logo} and ID of ${id}`,
    });
});


module.exports = router;
